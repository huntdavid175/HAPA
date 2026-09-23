/**
 * End-to-end check of the order actions: resend, void, mark refunded.
 *
 * The actions themselves are Server Actions and cannot be invoked from a script, so this
 * verifies the guarantees they depend on and the state transitions they perform — done
 * here exactly as the action does them, against the real database:
 *
 *   - voiding a ticket genuinely returns the seat to sale
 *   - the database refuses to void someone who has already walked in
 *   - a resend after a void describes only the tickets the buyer still holds
 *   - a message the worker has given up on is not retried on its own, and the retry
 *     action's reset is what puts it back within reach of the claim query
 *
 * Run:  npm run check:orders
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);

const TAG = "orders-check";
let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) {
    console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function cleanup() {
  await db.from("orders").delete().like("paystack_reference", `${TAG}%`);
}

/** Remaining stock for one tier, straight from the function the public page uses. */
async function available(eventId: string, tierId: string): Promise<number> {
  const { data, error } = await db.rpc("tier_availability", { p_event_id: eventId });
  if (error) throw error;
  return data!.find((r: { tier_id: string }) => r.tier_id === tierId)!.available;
}

/** The ticket set a resend would describe — live tickets only, as composeTicketMessage reads them. */
async function liveCodes(orderId: string): Promise<string[]> {
  const { data } = await db
    .from("tickets")
    .select("code")
    .eq("order_id", orderId)
    .in("status", ["issued", "checked_in"])
    .order("code");
  return (data ?? []).map((t) => t.code);
}

async function main() {
  const { data: event } = await db
    .from("events").select("id").eq("slug", "sample-event").single();
  if (!event) throw new Error("Run: npm run seed");
  const eventId = event.id;

  const { data: tier } = await db
    .from("ticket_tiers").select("id, price_pesewas").eq("event_id", eventId)
    .eq("name", "Regular").single();
  const tierId = tier!.id;

  await cleanup();

  async function makeOrder(ref: string, name: string, ticketCount: number) {
    const { data: order, error } = await db.from("orders").insert({
      event_id: eventId, buyer_name: name,
      buyer_phone: "+233201111111", buyer_email: `${ref}@example.com`,
      total_pesewas: tier!.price_pesewas * ticketCount, status: "paid",
      paid_at: new Date().toISOString(), paystack_reference: ref,
      hold_expires_at: new Date(Date.now() + 600000).toISOString(),
    }).select("id").single();
    if (error) throw error;

    await db.from("order_items").insert({
      order_id: order.id, tier_id: tierId,
      quantity: ticketCount, unit_price_pesewas: tier!.price_pesewas,
    });
    const { data: tickets, error: tErr } = await db.from("tickets").insert(
      Array.from({ length: ticketCount }, () => ({
        order_id: order.id, tier_id: tierId, event_id: eventId,
      })),
    ).select("id, code, qr_token").order("code");
    if (tErr) throw tErr;
    return { orderId: order.id, tickets: tickets! };
  }

  // -----------------------------------------------------------------------------------
  console.log("\nVoiding a ticket");
  const { orderId, tickets } = await makeOrder(`${TAG}-01`, "Ama Mensah", 3);

  const before = await available(eventId, tierId);
  const { error: voidError } = await db
    .from("tickets")
    .update({ status: "void", void_reason: "Duplicate purchase" })
    .eq("id", tickets[0].id)
    .eq("status", "issued");
  check("voiding an issued ticket succeeds", voidError, null);

  const after = await available(eventId, tierId);
  check("the seat goes back on sale", after, before + 1);

  const codesAfterVoid = await liveCodes(orderId);
  check("a resend would list only the 2 tickets still held", codesAfterVoid.length, 2);
  check("and would not mention the voided code", codesAfterVoid.includes(tickets[0].code), false);

  // -----------------------------------------------------------------------------------
  console.log("\nA ticket that has already walked in");
  const { data: admitted } = await db.rpc("check_in_ticket", {
    p_lookup: tickets[1].qr_token, p_staff: null,
  });
  check("the ticket checks in", admitted![0].outcome, "valid");

  const { error: voidAdmitted } = await db
    .from("tickets")
    .update({ status: "void", void_reason: "should not work" })
    .eq("id", tickets[1].id);
  check("the database refuses to void an admitted ticket", voidAdmitted !== null, true);

  const { data: stillIn } = await db
    .from("tickets").select("status").eq("id", tickets[1].id).single();
  check("and the check-in record survives the attempt", stillIn!.status, "checked_in");

  // -----------------------------------------------------------------------------------
  console.log("\nMarking the order refunded");
  const refundedAt = new Date().toISOString();
  await db.from("tickets").update({ refunded_at: refundedAt }).eq("order_id", orderId);
  await db.from("tickets")
    .update({ status: "void", void_reason: "Refunded: buyer cancelled" })
    .eq("order_id", orderId).eq("status", "issued");
  await db.from("orders")
    .update({ needs_refund: false, refund_reason: "buyer cancelled" }).eq("id", orderId);

  const { data: afterRefund } = await db
    .from("tickets").select("status, refunded_at").eq("order_id", orderId);
  const stamped = afterRefund!.filter((t) => t.refunded_at !== null).length;
  const voided = afterRefund!.filter((t) => t.status === "void").length;
  const used = afterRefund!.filter((t) => t.status === "checked_in").length;
  check("every ticket on the order is stamped refunded", stamped, 3);
  check("the two unused tickets are voided", voided, 2);
  check("the admitted one stays on the record as used", used, 1);

  // -----------------------------------------------------------------------------------
  console.log("\nRetrying a message the worker gave up on");
  const { orderId: outboxOrder } = await makeOrder(`${TAG}-02`, "Kwame Owusu", 1);

  const { data: delivery, error: dErr } = await db.from("message_deliveries").insert({
    order_id: outboxOrder, channel: "sms",
    recipient: "+233201111111", body: "Your ticket",
    status: "failed", attempts: 5, error: "Unreachable",
    next_attempt_at: new Date(Date.now() - 60000).toISOString(),
  }).select("id").single();
  if (dErr) throw dErr;

  const { data: firstClaim, error: cErr } = await db.rpc("claim_message_deliveries", { p_limit: 50 });
  if (cErr) throw cErr;
  const claimedParked = (firstClaim ?? []).some((r: { id: string }) => r.id === delivery.id);
  check("a message parked after 5 tries is not picked up again", claimedParked, false);

  // Exactly what retryDelivery does.
  await db.from("message_deliveries")
    .update({ status: "queued", attempts: 0, error: null, next_attempt_at: new Date().toISOString() })
    .eq("id", delivery.id).eq("status", "failed");

  const { data: secondClaim } = await db.rpc("claim_message_deliveries", { p_limit: 50 });
  const claimedAfterReset = (secondClaim ?? []).some((r: { id: string }) => r.id === delivery.id);
  check("after the retry reset the worker claims it", claimedAfterReset, true);

  const { data: resetRow } = await db
    .from("message_deliveries").select("error").eq("id", delivery.id).single();
  check("and the stale error text is cleared", resetRow!.error, null);

  // -----------------------------------------------------------------------------------
  console.log("\nCleaning up");
  await cleanup();
  const { count } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .like("paystack_reference", `${TAG}%`);
  check("test orders removed", count, 0);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err.message ?? err);
  await cleanup();
  process.exit(1);
});
