import { type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentStatus } from "@/lib/moolre";
import { settlePaidOrder } from "@/lib/payments/settle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER = "moolre";

/**
 * Moolre payment callback. This is the only place tickets are issued *and* delivered.
 *
 * The buyer's redirect back to /order/[reference] checks too, for fast feedback, and may
 * issue (idempotently), but it queues no message — a buyer who closes the tab mid mobile
 * money (very common) must still get their ticket, and that only works if delivery does
 * not depend on their browser coming back.
 *
 * Moolre does not sign callbacks. Anyone who knows this URL can post to it, so the body is
 * treated as a hint that says *which* order to look at, never as proof of payment:
 *   1. read the reference out of the body, however it is shaped
 *   2. record the callback; one already handled successfully stops here
 *   3. ask Moolre's status endpoint, with our key, what actually happened — and check the
 *      amount against our order
 *   4. issue tickets and queue delivery (`settlePaidOrder`, shared with reconciliation)
 *   5. return 200 quickly — sending is the worker's job
 *
 * A forged callback therefore costs one status lookup and grants nothing.
 *
 * When Moolre's status lookup itself fails (as through their 3 Oct 2026 outage), the
 * answer is a 500, not "not paid": that asks Moolre to send the callback again, instead
 * of telling it the notification landed. Reconciliation (/api/cron/reconcile) catches the
 * payment regardless — including when Moolre never calls at all.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const body = parseBody(raw, request.headers.get("content-type") ?? "");
  if (!body) return new Response("Malformed payload", { status: 400 });

  const data = (isRecord(body.data) ? body.data : {}) as Record<string, unknown>;
  const metadata = isRecord(data.metadata) ? data.metadata : {};

  // 1. Which order. Our reference is Moolre's `externalref`; the metadata copy is a
  //    fallback in case a callback carries one and not the other.
  const reference = str(data.externalref) ?? str(metadata.reference) ?? str(body.externalref);
  if (!reference) return new Response("Ignored", { status: 200 });

  // Stable across redeliveries of the same notification, distinct for a later one about
  // the same payment (pending, then successful).
  const providerEventId = [
    reference,
    str(data.transactionid) ?? "-",
    str(data.txstatus) ?? str(body.code) ?? "-",
  ].join(":");

  const db = createAdminClient();

  // 2. Idempotency. A callback already handled without error is done. One that failed
  //    or found the payment not yet complete is handled again — the status check decides,
  //    and issuing is idempotent, so re-running cannot hand out a second set.
  const { error: insertError } = await db.from("webhook_events").insert({
    provider: PROVIDER,
    provider_event_id: providerEventId,
    event_type: str(body.code),
    payload: {
      ...body,
      // No signature to keep, so keep where it came from: Moolre's POS callbacks come
      // from 174.138.44.22 / 2604:a880:400:d0::1a77:400 (docs: Authentication).
      _source_ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    } as never,
  });

  if (insertError) {
    if (insertError.code !== "23505") {
      return new Response(`Could not record event: ${insertError.message}`, { status: 500 });
    }
    const { data: seen } = await db
      .from("webhook_events")
      .select("processed_at, error")
      .eq("provider", PROVIDER)
      .eq("provider_event_id", providerEventId)
      .maybeSingle();
    if (seen?.processed_at && !seen.error) {
      return new Response("Already processed", { status: 200 });
    }
  }

  try {
    const { data: order } = await db
      .from("orders")
      .select("id, total_pesewas, currency, status")
      .eq("paystack_reference", reference)
      .maybeSingle();

    if (!order) {
      await markProcessed(db, providerEventId, "No matching order");
      return new Response("Unknown order", { status: 200 });
    }

    // 3. Never trust the callback — ask Moolre directly.
    const verified = await getPaymentStatus(reference);

    if (!verified.answered) {
      const reason = `Moolre status lookup failed: ${verified.code ?? "no code"} ${verified.message ?? ""}`.trim();
      await markProcessed(db, providerEventId, reason);
      return new Response(reason, { status: 500 });
    }

    if (!verified.paid) {
      await markProcessed(
        db,
        providerEventId,
        `Not paid at Moolre: txstatus ${verified.txstatus ?? "none"} (${verified.code ?? "no code"}: ${verified.message ?? ""})`,
      );
      return new Response("Not a successful payment", { status: 200 });
    }

    // 4. Check the amount, issue tickets, queue delivery — all idempotent.
    const outcome = await settlePaidOrder(db, order, verified);
    if (outcome.kind === "mismatch") {
      await markProcessed(db, providerEventId, "Amount mismatch");
      return new Response("Amount mismatch", { status: 200 });
    }

    await markProcessed(db, providerEventId);
    return Response.json({ ok: true, issued: outcome.issued, shortfall: outcome.shortfall });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markProcessed(db, providerEventId, message);
    // 500 so Moolre retries, if it does; the guard above makes a retry safe.
    return new Response(`Processing failed: ${message}`, { status: 500 });
  }
}

/**
 * JSON as documented. A body sent as a form is accepted too rather than dropped — but
 * only when it says it is one, or any garbage would parse as a form with one odd key.
 */
function parseBody(raw: string, contentType: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    if (!contentType.includes("application/x-www-form-urlencoded")) return null;
    const form = new URLSearchParams(raw);
    if (![...form.keys()].length) return null;
    const out: Record<string, unknown> = Object.fromEntries(form);
    if (typeof out.data === "string") {
      try {
        out.data = JSON.parse(out.data);
      } catch {
        // leave as text
      }
    }
    return out;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

async function markProcessed(
  db: ReturnType<typeof createAdminClient>,
  providerEventId: string,
  error?: string,
) {
  await db
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString(), error: error ?? null })
    .eq("provider", PROVIDER)
    .eq("provider_event_id", providerEventId);
}
