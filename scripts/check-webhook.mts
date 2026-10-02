/**
 * Moolre callback checks.
 *
 * Moolre does not sign its callbacks, so the property that matters most is that a forged
 * "payment successful" body grants nothing: the route must ask Moolre's status endpoint
 * and believe only that. This posts such a forgery for a real pending order and checks
 * that no ticket appears and the order stays pending.
 *
 * Runs on a draft event and tier of its own (invisible to buyers), removed at the end on
 * success and on failure.
 *
 * Needs the dev server running with Moolre configured (sandbox values in .env.local):
 * the forged-callback case calls Moolre's status endpoint for real.
 *
 * Run:  npm run check:webhook
 */
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3000";
const TAG = "wh-check";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function post(body: string, contentType = "application/json") {
  return fetch(`${BASE}/api/webhooks/moolre`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

/** What Moolre's docs show a successful callback to look like. */
function successBody(reference: string, transactionId: string) {
  return JSON.stringify({
    status: 1,
    code: "P01",
    message: "Transaction Successful",
    data: { txstatus: 1, externalref: reference, transactionid: transactionId, amount: "10.00" },
  });
}

async function cleanup() {
  await db.from("webhook_events").delete().like("provider_event_id", `${TAG}%`);
  await db.from("orders").delete().like("paystack_reference", `${TAG}%`);
  await db.from("ticket_tiers").delete().like("name", `${TAG}%`);
  await db.from("events").delete().like("slug", `${TAG}%`);
}

async function main() {
  await cleanup();

  console.log("\nMalformed input");
  check("a body that is not JSON or a form → 400", (await post("{not json")).status, 400);
  const noRef = await post(JSON.stringify({ status: 1, code: "P01", data: {} }));
  check("a callback with no reference → 200", noRef.status, 200);
  check("…and is ignored", await noRef.text(), "Ignored");

  console.log("\nUnknown order");
  const unknownRef = `${TAG}-nobody-${Date.now()}`;
  const unknown = await post(successBody(unknownRef, "1"));
  check("a reference with no order → 200", unknown.status, 200);
  check("…answered as unknown", await unknown.text(), "Unknown order");
  const { data: logged } = await db
    .from("webhook_events")
    .select("provider, error, processed_at")
    .like("provider_event_id", `${unknownRef}%`);
  check("recorded once, as moolre", logged?.map((r) => r.provider), ["moolre"]);
  check("with the reason", logged?.[0]?.error, "No matching order");
  await db.from("webhook_events").delete().like("provider_event_id", `${unknownRef}%`);

  console.log("\nForged success for a real pending order");
  const { data: event, error: eventError } = await db
    .from("events")
    .insert({
      name: `${TAG} scratch event`,
      slug: `${TAG}-${Date.now()}`,
      venue: "Nowhere",
      starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .select("id")
    .single();
  if (eventError) throw new Error(`could not create the test event: ${eventError.message}`);

  const { data: tier, error: tierError } = await db
    .from("ticket_tiers")
    .insert({
      event_id: event.id,
      name: `${TAG}-tier`,
      description: "Temporary, created by check:webhook",
      price_pesewas: 1000,
      capacity: 5,
      position: 0,
    })
    .select("id")
    .single();
  if (tierError) throw new Error(`could not create the test tier: ${tierError.message}`);

  const reference = `${TAG}-order-${Date.now()}`;
  const { error: reserveError } = await db.rpc("reserve_tickets", {
    p_event_id: event.id,
    p_items: [{ tier_id: tier.id, quantity: 1 }],
    p_buyer_name: "Webhook Check",
    p_buyer_phone: "+233201000000",
    p_buyer_email: "wh-check@example.com",
    p_reference: reference,
    p_ip_hash: null,
    p_hold_minutes: 10,
  });
  if (reserveError) throw new Error(`could not reserve: ${reserveError.message}`);

  // The body claims success, with the right amount. Moolre has never seen this
  // reference, so its status endpoint must say otherwise — and that is what counts.
  const forged = await post(successBody(reference, `${TAG}-tx`));
  const forgedText = await forged.text();
  check("the forged callback is answered 200 (nothing to retry)", forged.status, 200);
  check("…and rejected as not paid", forgedText, "Not a successful payment");

  const { data: order } = await db
    .from("orders")
    .select("id, status")
    .eq("paystack_reference", reference)
    .single();
  check("the order is still pending", order?.status, "pending");
  const { count: tickets } = await db
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("order_id", order!.id);
  check("no ticket was issued", tickets, 0);
  const { count: messages } = await db
    .from("message_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("order_id", order!.id);
  check("no message was queued", messages, 0);

  console.log("\nRedelivery");
  const again = await post(successBody(reference, `${TAG}-tx`));
  check(
    "the same callback again is checked again, not waved through",
    await again.text(),
    "Not a successful payment",
  );
  const { count: rows } = await db
    .from("webhook_events")
    .select("id", { count: "exact", head: true })
    .like("provider_event_id", `${reference}%`);
  check("still one record of it", rows, 1);

  await cleanup();
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("\nCheck failed:", err.message ?? err);
  await cleanup();
  process.exit(1);
});
