/**
 * Paystack webhook checks.
 *
 * Signs payloads with the configured secret exactly as Paystack does — HMAC-SHA512 over
 * the raw body, hex — so the signature path, the idempotency guard and the event filter
 * are all exercised for real.
 *
 * What this cannot cover without live test keys: the `charge.success` branch, because it
 * calls Paystack's verify endpoint. Everything up to that point is checked here.
 *
 * Run:  npm run check:webhook
 */
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.PAYSTACK_SECRET_KEY;

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

function sign(body: string): string {
  return createHmac("sha512", SECRET!).update(body, "utf8").digest("hex");
}

async function post(body: string, signature?: string) {
  return fetch(`${BASE}/api/webhooks/paystack`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature ? { "x-paystack-signature": signature } : {}),
    },
    body,
  });
}

async function main() {
  if (!SECRET) {
    console.error("PAYSTACK_SECRET_KEY must be set (a placeholder is fine for these checks).");
    process.exit(1);
  }

  const eventId = `wh-check-${Date.now()}`;
  const payload = JSON.stringify({
    event: "charge.failed",
    id: eventId,
    data: { id: 1, reference: "wh-check-ref", status: "failed" },
  });

  console.log("\nSignature verification");
  check("no signature header → 401", (await post(payload)).status, 401);
  check("wrong signature → 401", (await post(payload, "deadbeef")).status, 401);
  check(
    "signature of a different body → 401",
    (await post(payload, sign('{"tampered":true}'))).status,
    401,
  );

  console.log("\nAccepted events");
  const good = await post(payload, sign(payload));
  check("valid signature is accepted", good.status, 200);
  check("a non-charge.success event grants nothing", await good.text(), "Ignored");

  console.log("\nIdempotency");
  const replay = await post(payload, sign(payload));
  check("the same event replayed → 200", replay.status, 200);
  check("and is recognised as already seen", await replay.text(), "Already processed");

  const { count } = await db
    .from("webhook_events")
    .select("id", { count: "exact", head: true })
    .eq("provider_event_id", eventId);
  check("recorded exactly once", count, 1);

  const { data: row } = await db
    .from("webhook_events")
    .select("processed_at, event_type")
    .eq("provider_event_id", eventId)
    .single();
  check("marked processed", row!.processed_at !== null, true);
  check("event type recorded", row!.event_type, "charge.failed");

  console.log("\nMalformed input");
  const bad = "{not json";
  check("bad JSON with a valid signature → 400", (await post(bad, sign(bad))).status, 400);

  const noRef = JSON.stringify({ event: "charge.success", id: `${eventId}-noref`, data: {} });
  check(
    "a payload with no reference is ignored, not crashed on",
    (await post(noRef, sign(noRef))).status,
    200,
  );

  await db.from("webhook_events").delete().like("provider_event_id", "wh-check-%");

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("\nCheck failed:", err.message ?? err);
  await db.from("webhook_events").delete().like("provider_event_id", "wh-check-%");
  process.exit(1);
});
