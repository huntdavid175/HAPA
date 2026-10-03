import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentStatus } from "@/lib/moolre";
import { settlePaidOrder } from "./settle";

type Db = ReturnType<typeof createAdminClient>;

export type ReconcileResult = {
  checked: number;
  settled: { reference: string; issued: number; shortfall: number }[];
  mismatched: string[];
  /** Moolre's lookup failed; asked again on the next run. */
  unanswered: string[];
};

/**
 * Asks Moolre about unsettled orders and settles the ones it says are paid.
 *
 * The safety net under the webhook. Moolre can take a payment and never call back — it
 * did on 3 Oct 2026, through an outage — and nothing else would notice. Which orders are
 * due a check, and how often, is `payment_reconcile_candidates` (migration
 * 20261003090000): unsettled, 2 minutes to 48 hours old, backing off with age.
 *
 * Settling is `settlePaidOrder`, the webhook's own code, with a status fetched here — so
 * this grants exactly what a verified callback would, and nothing more. Each order's
 * `payment_checked_at` is stamped whatever the answer, so the backoff holds even when
 * Moolre is down.
 */
export async function reconcilePayments(db: Db, limit = 25): Promise<ReconcileResult> {
  const { data: candidates, error } = await db.rpc("payment_reconcile_candidates", {
    p_limit: limit,
  });
  if (error) throw error;

  const result: ReconcileResult = { checked: 0, settled: [], mismatched: [], unanswered: [] };

  for (const order of candidates ?? []) {
    result.checked++;

    let verified;
    try {
      verified = await getPaymentStatus(order.reference);
    } catch {
      verified = null;
    }

    await db
      .from("orders")
      .update({ payment_checked_at: new Date().toISOString() })
      .eq("id", order.id);

    if (!verified?.answered) {
      result.unanswered.push(order.reference);
      continue;
    }
    if (!verified.paid) continue;

    const outcome = await settlePaidOrder(db, order, verified);
    if (outcome.kind === "mismatch") {
      result.mismatched.push(order.reference);
      continue;
    }

    result.settled.push({
      reference: order.reference,
      issued: outcome.issued,
      shortfall: outcome.shortfall,
    });

    // The audit trail a callback would have left, so the admin can see how it was paid.
    await db.from("webhook_events").insert({
      provider: "moolre",
      provider_event_id: `${order.reference}:reconciled`,
      event_type: "reconciled",
      payload: {
        note: "Paid at Moolre with no callback received; settled by reconciliation.",
        transactionid: verified.transactionId,
        amount_pesewas: verified.amountPesewas,
      } as never,
      processed_at: new Date().toISOString(),
    });
  }

  return result;
}
