import { type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature, verifyTransaction } from "@/lib/paystack";
import { queueTicketDelivery } from "@/lib/messaging/ticket-message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paystack webhook. This is the only place tickets are issued.
 *
 * The buyer's redirect back to /order/[reference] verifies too, for fast feedback, but it
 * grants nothing — a buyer who closes their browser mid mobile-money (very common) must
 * still get their ticket, and that only works if issuance does not depend on their
 * browser coming back.
 *
 * Order of operations matters and is deliberate:
 *   1. read the RAW body and verify the signature before parsing anything
 *   2. record the event id; a duplicate means we have seen it, so stop
 *   3. ask Paystack what actually happened, and check the amount against our order
 *   4. issue tickets and queue delivery in one database call
 *   5. return 200 quickly — sending is the worker's job
 */
export async function POST(request: NextRequest) {
  // 1. Verify before parsing. Re-serializing JSON changes bytes and breaks the HMAC.
  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    // Deliberately terse: an attacker probing this endpoint learns nothing.
    return new Response("Invalid signature", { status: 401 });
  }

  let event: {
    event?: string;
    id?: string | number;
    data?: { id?: number; reference?: string; status?: string };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Malformed payload", { status: 400 });
  }

  const reference = event.data?.reference;
  // Paystack does not always send a top-level event id, so fall back to the transaction
  // id plus event name — still stable across retries of the same event.
  const providerEventId = String(event.id ?? `${event.event}:${event.data?.id ?? reference}`);

  if (!reference) {
    return new Response("Ignored", { status: 200 });
  }

  const db = createAdminClient();

  // 2. Idempotency. A unique violation means this exact event already arrived; a
  //    duplicate must never hand out a second set of tickets.
  const { error: dupeError } = await db.from("webhook_events").insert({
    provider: "paystack",
    provider_event_id: providerEventId,
    event_type: event.event ?? null,
    payload: event as never,
  });

  if (dupeError) {
    if (dupeError.code === "23505") {
      return new Response("Already processed", { status: 200 });
    }
    // Could not even record the event — fail loudly so Paystack retries.
    return new Response(`Could not record event: ${dupeError.message}`, { status: 500 });
  }

  // Only successful charges grant anything.
  if (event.event !== "charge.success") {
    await markProcessed(db, providerEventId);
    return new Response("Ignored", { status: 200 });
  }

  try {
    // 3. Never trust the payload's amount — ask Paystack directly.
    const verified = await verifyTransaction(reference);

    const { data: order } = await db
      .from("orders")
      .select("id, total_pesewas, status")
      .eq("paystack_reference", reference)
      .maybeSingle();

    if (!order) {
      await markProcessed(db, providerEventId, "No matching order");
      return new Response("Unknown order", { status: 200 });
    }

    if (verified.status !== "success") {
      await markProcessed(db, providerEventId, `Transaction status ${verified.status}`);
      return new Response("Not a successful charge", { status: 200 });
    }

    // An amount mismatch means the reference was reused or tampered with. Record it and
    // grant nothing.
    if (verified.amountPesewas !== order.total_pesewas) {
      await db.from("orders").update({
        needs_refund: true,
        refund_reason: `Paid ${verified.amountPesewas} pesewas but order total is ${order.total_pesewas}`,
      }).eq("id", order.id);
      await markProcessed(db, providerEventId, "Amount mismatch");
      return new Response("Amount mismatch", { status: 200 });
    }

    if (verified.currency !== "GHS") {
      await markProcessed(db, providerEventId, `Unexpected currency ${verified.currency}`);
      return new Response("Unexpected currency", { status: 200 });
    }

    // 4. Issue tickets. Idempotent in the database, so even if this line runs twice the
    //    buyer gets one set.
    const { data: issued, error: issueError } = await db.rpc("issue_tickets_for_order", {
      p_order_id: order.id,
      p_channel: verified.channel ?? undefined,
    });
    if (issueError) throw issueError;

    await queueTicketDelivery(db, order.id);
    await markProcessed(db, providerEventId);

    const result = issued?.[0];
    return Response.json({
      ok: true,
      issued: result?.issued ?? 0,
      shortfall: result?.shortfall ?? 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markProcessed(db, providerEventId, message);
    // 500 so Paystack retries; the idempotency guard makes that safe.
    return new Response(`Processing failed: ${message}`, { status: 500 });
  }
}

async function markProcessed(
  db: ReturnType<typeof createAdminClient>,
  providerEventId: string,
  error?: string,
) {
  await db
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString(), error: error ?? null })
    .eq("provider", "paystack")
    .eq("provider_event_id", providerEventId);
}
