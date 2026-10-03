import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { ONLINE_CURRENCY } from "@/lib/currency";
import type { PaymentStatus } from "@/lib/moolre";
import { queueTicketDelivery } from "@/lib/messaging/ticket-message";

type Db = ReturnType<typeof createAdminClient>;

export type SettleOutcome =
  | { kind: "issued"; issued: number; shortfall: number }
  | { kind: "mismatch" };

/**
 * Settles an order Moolre has confirmed as paid: checks the amount, issues the tickets
 * and queues their delivery.
 *
 * The one place this happens. The webhook (fast path) and reconciliation (safety net,
 * lib/payments/reconcile.ts) both call it with a status they fetched from Moolre
 * themselves, so neither can grant on a callback's say-so, and the two cannot drift.
 * Everything here is idempotent: issuing twice gives one set, delivery is queued once.
 *
 * `verified.paid` must already be true — this checks only that the money matches.
 */
export async function settlePaidOrder(
  db: Db,
  order: { id: string; total_pesewas: number; currency: string },
  verified: PaymentStatus,
): Promise<SettleOutcome> {
  // An amount mismatch means the reference was reused or tampered with. Record it and
  // grant nothing. Moolre settles cedis only, which checkout guarantees for the order.
  if (verified.amountPesewas !== order.total_pesewas || order.currency !== ONLINE_CURRENCY) {
    await db
      .from("orders")
      .update({
        needs_refund: true,
        refund_reason: `Paid ${verified.amountPesewas ?? "an unknown amount of"} pesewas at Moolre but the order total is ${order.total_pesewas} ${order.currency}`,
      })
      .eq("id", order.id);
    return { kind: "mismatch" };
  }

  const { data: issued, error } = await db.rpc("issue_tickets_for_order", {
    p_order_id: order.id,
    p_channel: "moolre",
  });
  if (error) throw error;

  await queueTicketDelivery(db, order.id);

  const result = issued?.[0];
  return { kind: "issued", issued: result?.issued ?? 0, shortfall: result?.shortfall ?? 0 };
}
