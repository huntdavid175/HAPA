/**
 * Checkout and issuance checks.
 *
 * The headline test is overselling: N+5 buyers racing for N tickets must produce exactly
 * N orders. That is the whole reason reserve_tickets holds a row lock, and a unit test
 * that calls it sequentially would prove nothing.
 *
 * Also covers hold expiry, the abuse guard, replayed issuance, and the case that worried
 * us in the interview — a payment confirming after its hold lapsed and the stock is gone.
 *
 * Run:  npm run check:checkout
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);

const TAG = "checkout-check";
let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function cleanup() {
  await db.from("orders").delete().like("paystack_reference", `${TAG}%`);
}

async function reserve(
  eventId: string, tierId: string, qty: number, ref: string,
  phone = "+233201000000", ip: string | null = null,
) {
  return db.rpc("reserve_tickets", {
    p_event_id: eventId,
    p_items: [{ tier_id: tierId, quantity: qty }],
    p_buyer_name: "Race Buyer",
    p_buyer_phone: phone,
    p_buyer_email: "race@example.com",
    p_reference: ref,
    p_ip_hash: ip,
    p_hold_minutes: 10,
  });
}

async function main() {
  const { data: event } = await db
    .from("events").select("id").eq("slug", "sample-event").single();
  if (!event) throw new Error("Run: npm run seed");
  const eventId = event.id;

  const { data: tier } = await db
    .from("ticket_tiers").select("id, capacity").eq("event_id", eventId)
    .eq("name", "VIP").single();
  const tierId = tier!.id;
  const originalCapacity = tier!.capacity;

  await cleanup();

  // --- Overselling ---------------------------------------------------------------------
  const CAPACITY = 5;
  const RACERS = 10;
  await db.from("ticket_tiers").update({ capacity: CAPACITY }).eq("id", tierId);

  console.log(`\nOverselling: ${RACERS} simultaneous buyers, ${CAPACITY} tickets`);
  const races = await Promise.all(
    Array.from({ length: RACERS }, (_, i) =>
      // Distinct phone + ip per buyer so the abuse guard does not mask the real test.
      reserve(eventId, tierId, 1, `${TAG}-race-${i}`, `+2332010000${String(i).padStart(2, "0")}`, randomUUID()),
    ),
  );
  const ok = races.filter((r) => !r.error).length;
  const refused = races.filter((r) => r.error).length;
  check(`exactly ${CAPACITY} reservations succeed`, ok, CAPACITY);
  check(`the other ${RACERS - CAPACITY} are refused`, refused, RACERS - CAPACITY);

  const { count: held } = await db
    .from("orders").select("id", { count: "exact", head: true })
    .eq("event_id", eventId).eq("status", "pending");
  check("no more orders than capacity exist", held, CAPACITY);

  const sixth = await reserve(eventId, tierId, 1, `${TAG}-sixth`, "+233209999001", randomUUID());
  check("a later buyer is told it is sold out", /sold out/i.test(sixth.error?.message ?? ""), true);

  // --- Holds expire --------------------------------------------------------------------
  console.log("\nHold expiry");
  await db.from("orders")
    .update({ hold_expires_at: new Date(Date.now() - 60_000).toISOString() })
    .like("paystack_reference", `${TAG}-race-%`);

  const afterExpiry = await reserve(eventId, tierId, 1, `${TAG}-after`, "+233209999002", randomUUID());
  check("stock frees up once holds lapse", afterExpiry.error, null);

  const { data: swept } = await db.rpc("expire_stale_holds", { p_grace_minutes: 0 });
  check("the sweeper marks lapsed holds expired", swept, CAPACITY);

  // --- Abuse guard ---------------------------------------------------------------------
  console.log("\nAbuse guard");
  await cleanup();
  await db.from("ticket_tiers").update({ capacity: 100 }).eq("id", tierId);

  const sameIp = randomUUID();
  const attempts = [];
  for (let i = 0; i < 4; i++) {
    attempts.push(await reserve(eventId, tierId, 1, `${TAG}-abuse-${i}`, `+23320888000${i}`, sameIp));
  }
  check("first three holds from one source are allowed", attempts.slice(0, 3).every((a) => !a.error), true);
  check("the fourth is refused", /already have tickets held/i.test(attempts[3].error?.message ?? ""), true);

  // --- Issuance ------------------------------------------------------------------------
  console.log("\nIssuance");
  await cleanup();
  const res = await reserve(eventId, tierId, 3, `${TAG}-issue`, "+233207777777", randomUUID());
  check("reserving 3 tickets succeeds", res.error, null);
  const orderId = res.data![0].order_id;

  const first = await db.rpc("issue_tickets_for_order", { p_order_id: orderId, p_channel: "mobile_money" });
  check("issues one ticket per admission", first.data![0].issued, 3);
  check("nothing short", first.data![0].shortfall, 0);

  const replay = await db.rpc("issue_tickets_for_order", { p_order_id: orderId, p_channel: "mobile_money" });
  check("a replayed webhook issues no extra tickets", replay.data![0].issued, 3);

  const { count: ticketCount } = await db
    .from("tickets").select("id", { count: "exact", head: true }).eq("order_id", orderId);
  check("still exactly 3 tickets in the database", ticketCount, 3);

  const { data: order } = await db
    .from("orders").select("status, paid_at, paystack_channel").eq("id", orderId).single();
  check("order marked paid", order!.status, "paid");
  check("payment channel recorded", order!.paystack_channel, "mobile_money");

  // --- Late payment, stock gone --------------------------------------------------------
  console.log("\nLate payment after the stock is gone");
  await cleanup();
  await db.from("ticket_tiers").update({ capacity: 1 }).eq("id", tierId);

  const late = await reserve(eventId, tierId, 1, `${TAG}-late`, "+233206666666", randomUUID());
  const lateOrder = late.data![0].order_id;
  // Someone else's payment lands first and takes the last ticket.
  const rival = await reserve(eventId, tierId, 1, `${TAG}-rival`, "+233206666667", randomUUID());
  check("rival cannot reserve the same last ticket", rival.error !== null, true);

  // Force the situation: expire the hold, let a rival take it, then pay late.
  await db.from("orders").update({ hold_expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("id", lateOrder);
  const rival2 = await reserve(eventId, tierId, 1, `${TAG}-rival2`, "+233206666668", randomUUID());
  await db.rpc("issue_tickets_for_order", { p_order_id: rival2.data![0].order_id, p_channel: "card" });

  const lateResult = await db.rpc("issue_tickets_for_order", { p_order_id: lateOrder, p_channel: "mobile_money" });
  check("late payment issues no ticket", lateResult.data![0].issued, 0);
  check("and reports the shortfall", lateResult.data![0].shortfall, 1);

  const { data: flagged } = await db
    .from("orders").select("status, needs_refund, refund_reason").eq("id", lateOrder).single();
  check("order is still marked paid (the money did arrive)", flagged!.status, "paid");
  check("and flagged for refund rather than silently swallowed", flagged!.needs_refund, true);
  check("with a reason recorded", (flagged!.refund_reason ?? "").length > 0, true);

  await cleanup();
  await db.from("ticket_tiers").update({ capacity: originalCapacity }).eq("id", tierId);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("\nCheck failed:", err.message ?? err);
  await cleanup();
  process.exit(1);
});
