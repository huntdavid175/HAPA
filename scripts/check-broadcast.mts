/**
 * End-to-end check of the broadcast pipeline against the live database and the running
 * dev server.
 *
 * Seeds three paid buyers, exercises fan-out and the audience filters, proves the
 * enqueue is idempotent (a double submit must not message everyone twice), then drains
 * the outbox through the real cron endpoint so the secret guard is checked too.
 *
 * Everything it creates is removed at the end.
 *
 * Run:  npm run check:broadcast
 */
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3000";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);

const TAG = "bcast-check";
let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function cleanup(eventId: string) {
  await db.from("broadcasts").delete().eq("event_id", eventId);
  await db.from("orders").delete().like("paystack_reference", `${TAG}%`);
}

async function main() {
  const { data: event } = await db
    .from("events").select("id").eq("slug", "sample-event").single();
  if (!event) throw new Error("Seed the sample event first: npm run seed");
  // Bind to a const so the narrowing survives into the closures below.
  const eventId = event.id;

  const { data: tiers } = await db
    .from("ticket_tiers").select("id, name, price_pesewas").eq("event_id", eventId);
  const early = tiers!.find((t) => t.name === "Early Bird")!;
  const regular = tiers!.find((t) => t.name === "Regular")!;

  await cleanup(eventId);

  // --- Seed three buyers -------------------------------------------------------------
  async function buyer(name: string, ref: string, tier: typeof early, checkedIn: boolean) {
    const { data: order, error } = await db.from("orders").insert({
      event_id: eventId,
      buyer_name: name,
      buyer_phone: `+2332000000${ref.slice(-2)}`,
      buyer_email: `${ref}@example.com`,
      total_pesewas: tier.price_pesewas,
      status: "paid",
      paid_at: new Date().toISOString(),
      paystack_reference: ref,
      hold_expires_at: new Date(Date.now() + 600000).toISOString(),
    }).select("id").single();
    if (error) throw error;

    await db.from("order_items").insert({
      order_id: order.id, tier_id: tier.id, quantity: 1, unit_price_pesewas: tier.price_pesewas,
    });
    await db.from("tickets").insert({
      order_id: order.id, tier_id: tier.id, event_id: eventId,
      status: checkedIn ? "checked_in" : "issued",
      checked_in_at: checkedIn ? new Date().toISOString() : null,
    });
    return order.id;
  }

  await buyer("Ama Early", `${TAG}-01`, early, false);
  await buyer("Kojo Regular", `${TAG}-02`, regular, true);
  await buyer("Esi Regular", `${TAG}-03`, regular, false);
  console.log("\nSeeded 3 paid buyers (1 Early Bird, 2 Regular, 1 of them checked in)");

  // --- Fan-out ------------------------------------------------------------------------
  async function makeBroadcast(filter: object, channels: string[] = ["sms"]) {
    const { data, error } = await db.from("broadcasts").insert({
      event_id: eventId, channels, body: "Doors now open at 7pm.", audience_filter: filter,
    }).select("id").single();
    if (error) throw error;
    const { data: count, error: qErr } = await db.rpc("enqueue_broadcast", { p_broadcast_id: data.id });
    if (qErr) throw qErr;
    return { id: data.id, count };
  }

  console.log("\nAudience targeting");
  const all = await makeBroadcast({});
  check("everyone → 3 recipients", all.count, 3);

  const byTier = await makeBroadcast({ tier_id: regular.id });
  check("Regular tier only → 2 recipients", byTier.count, 2);

  const notArrived = await makeBroadcast({ checked_in: false });
  check("not checked in → 2 recipients", notArrived.count, 2);

  const arrived = await makeBroadcast({ checked_in: true });
  check("already checked in → 1 recipient", arrived.count, 1);

  const twoChannels = await makeBroadcast({}, ["sms", "email"]);
  check("sms + email → 6 rows (one per buyer per channel)", twoChannels.count, 6);

  console.log("\nIdempotency");
  const { data: again } = await db.rpc("enqueue_broadcast", { p_broadcast_id: all.id });
  check("re-enqueueing the same broadcast adds nothing", again, 0);

  console.log("\nCron endpoint guard");
  const noAuth = await fetch(`${BASE}/api/cron/deliver`, { method: "POST" });
  check("no secret → 404", noAuth.status, 404);
  const badAuth = await fetch(`${BASE}/api/cron/deliver`, {
    method: "POST", headers: { authorization: "Bearer wrong-secret" },
  });
  check("wrong secret → 404", badAuth.status, 404);

  console.log("\nWorker drains the outbox");
  const before = await db
    .from("message_deliveries").select("id", { count: "exact", head: true }).eq("status", "queued");
  console.log(`  queued before: ${before.count}`);

  let totalSent = 0;
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${BASE}/api/cron/deliver`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    if (res.status !== 200) { check("worker responded 200", res.status, 200); break; }
    const result = await res.json();
    totalSent += result.sent;
    if (result.claimed === 0) break;
  }
  check("all queued messages were sent", totalSent, before.count);

  const stillQueued = await db
    .from("message_deliveries").select("id", { count: "exact", head: true }).eq("status", "queued");
  check("nothing left queued", stillQueued.count, 0);

  const { data: finished } = await db
    .from("broadcasts").select("status, sent_count, recipient_count").eq("id", all.id).single();
  check("broadcast marked sent", finished!.status, "sent");
  check("sent_count matches recipients", finished!.sent_count, finished!.recipient_count);

  await cleanup(eventId);
  const leftover = await db
    .from("message_deliveries").select("id", { count: "exact", head: true });
  check("cleanup left no deliveries behind", leftover.count, 0);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nCheck failed:", err.message ?? err);
  process.exit(1);
});
