/**
 * End-to-end check of the gate.
 *
 * The headline test is concurrency: a forwarded QR scanned at two doors in the same
 * instant must admit exactly one person. That is a database guarantee (SELECT … FOR
 * UPDATE), and the only honest way to check it is to fire the requests in parallel and
 * count the outcomes.
 *
 * Also verifies that the door lookup cannot be turned into a buyer list.
 *
 * Run:  npm run check:gate
 */
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3000";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);

const TAG = "gate-check";
let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function scan(lookup: string) {
  const { data, error } = await db.rpc("check_in_ticket", { p_lookup: lookup, p_staff: null });
  if (error) throw error;
  return data![0];
}

async function cleanup() {
  await db.from("orders").delete().like("paystack_reference", `${TAG}%`);
}

async function main() {
  const { data: event } = await db
    .from("events").select("id").eq("slug", "sample-event").single();
  if (!event) throw new Error("Run: npm run seed");
  const eventId = event.id;

  const { data: tier } = await db
    .from("ticket_tiers").select("id, price_pesewas").eq("event_id", eventId)
    .eq("name", "Regular").single();

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
      order_id: order.id, tier_id: tier!.id,
      quantity: ticketCount, unit_price_pesewas: tier!.price_pesewas,
    });
    const { data: tickets, error: tErr } = await db.from("tickets").insert(
      Array.from({ length: ticketCount }, () => ({
        order_id: order.id, tier_id: tier!.id, event_id: eventId,
      })),
    ).select("id, code, qr_token");
    if (tErr) throw tErr;
    return tickets!;
  }

  const tickets = await makeOrder(`${TAG}-01`, "Ama Mensah", 3);
  console.log(`\nSeeded an order for Ama Mensah with ${tickets.length} tickets`);

  console.log("\nBasic outcomes");
  const first = await scan(tickets[0].qr_token);
  check("scanning a fresh QR admits", first.outcome, "valid");
  check("returns the buyer name", first.buyer_name, "Ama Mensah");

  const repeat = await scan(tickets[0].qr_token);
  check("scanning the same QR again is refused", repeat.outcome, "already_used");
  check("and reports when it was used", repeat.checked_in_at !== null, true);

  const byCode = await scan(tickets[1].code.toLowerCase());
  check("typing the short code works (case-insensitive)", byCode.outcome, "valid");

  const missing = await scan("NOT-AREALCODE");
  check("an unknown code is rejected", missing.outcome, "not_found");

  await db.from("tickets").update({ void_reason: "test", status: "void" }).eq("id", tickets[2].id);
  const voided = await scan(tickets[2].qr_token);
  check("a voided ticket is refused", voided.outcome, "void");

  // --- The one that actually matters --------------------------------------------------
  console.log("\nConcurrency: one forwarded QR, 10 simultaneous scans");
  const [solo] = await makeOrder(`${TAG}-02`, "Kwame Owusu", 1);
  const results = await Promise.all(Array.from({ length: 10 }, () => scan(solo.qr_token)));
  const admitted = results.filter((r) => r.outcome === "valid").length;
  const refused = results.filter((r) => r.outcome === "already_used").length;
  check("exactly one scan admits", admitted, 1);
  check("the other nine are told it is already used", refused, 9);

  const { data: after } = await db
    .from("tickets").select("status").eq("id", solo.id).single();
  check("ticket ends up checked_in exactly once", after!.status, "checked_in");

  // --- Door lookup must not become a buyer list ---------------------------------------
  console.log("\nGate lookup");
  const { data: byName } = await db.rpc("lookup_tickets", { p_event: eventId, p_query: "Ama" });
  check("finds the guest by name", byName!.length, 3);
  const fields = Object.keys(byName![0]).sort();
  check(
    "returns only gate-relevant fields (no phone, email or amount)",
    fields,
    ["buyer_name", "checked_in_at", "status", "ticket_code", "ticket_id", "tier_name"],
  );

  const { data: capped } = await db.rpc("lookup_tickets", { p_event: eventId, p_query: "a" });
  check("results are capped at 10", (capped!.length <= 10), true);

  // --- The buyer's ticket page --------------------------------------------------------
  console.log("\nTicket page");
  const page = await fetch(`${BASE}/t/${solo.qr_token}`);
  const html = await page.text();
  check("ticket page loads without signing in", page.status, 200);
  check("shows the short code", html.includes(solo.code), true);
  check("renders a QR", html.includes("<svg"), true);
  check("shows it has been used", html.includes("Already checked in"), true);

  const bogus = await fetch(`${BASE}/t/not-a-real-token-at-all`);
  check("an unknown token 404s", bogus.status, 404);

  await cleanup();
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("\nCheck failed:", err.message ?? err);
  await cleanup();
  process.exit(1);
});
