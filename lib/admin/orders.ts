import "server-only";

import { toCurrency, type Currency } from "@/lib/currency";
import { createAdminClient } from "@/lib/supabase/admin";

export type OrderTicket = {
  id: string;
  code: string;
  tierName: string;
  status: "issued" | "checked_in" | "void";
  checkedInAt: string | null;
  voidReason: string | null;
  refundedAt: string | null;
};

export type OrderDelivery = {
  id: string;
  channel: "sms" | "whatsapp" | "email";
  status: "queued" | "sending" | "sent" | "delivered" | "failed";
  recipient: string;
  attempts: number;
  error: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
  /** The worker gives up after 5 tries; past that only a human restarts it. */
  exhausted: boolean;
};

export type OrderDetail = {
  id: string;
  reference: string;
  status: "pending" | "paid" | "failed" | "expired";
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
  totalPesewas: number;
  /** The order's currency; its items were all priced in it. */
  currency: Currency;
  channel: string | null;
  needsRefund: boolean;
  refundReason: string | null;
  createdAt: string;
  paidAt: string | null;
  items: { tierName: string; quantity: number; unitPricePesewas: number }[];
  tickets: OrderTicket[];
  deliveries: OrderDelivery[];
};

const EXHAUSTED_AFTER = 5;

/**
 * Everything an organiser needs to answer "what happened to this person's order?".
 *
 * Runs under the secret key. The caller is responsible for having established that the
 * viewer is an admin — this module holds no authorization of its own, and the pages and
 * actions that use it all call `requireAdmin()` first.
 */
export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const db = createAdminClient();

  const { data: order } = await db
    .from("orders")
    .select(
      `id, paystack_reference, status, buyer_name, buyer_phone, buyer_email,
       total_pesewas, currency, paystack_channel, needs_refund, refund_reason,
       created_at, paid_at,
       order_items(quantity, unit_price_pesewas, ticket_tiers(name))`,
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return null;

  const [{ data: tickets }, { data: deliveries }] = await Promise.all([
    db
      .from("tickets")
      .select("id, code, status, checked_in_at, void_reason, refunded_at, ticket_tiers(name)")
      .eq("order_id", orderId)
      .order("code"),
    db
      .from("message_deliveries")
      .select("id, channel, status, recipient, attempts, error, created_at, last_attempt_at")
      .eq("order_id", orderId)
      .is("broadcast_id", null)
      .order("created_at", { ascending: false }),
  ]);

  const items = (order.order_items ?? []) as unknown as {
    quantity: number;
    unit_price_pesewas: number;
    ticket_tiers: { name: string } | null;
  }[];

  return {
    id: order.id,
    reference: order.paystack_reference,
    status: order.status,
    buyerName: order.buyer_name,
    buyerPhone: order.buyer_phone,
    buyerEmail: order.buyer_email,
    totalPesewas: order.total_pesewas,
    currency: toCurrency(order.currency),
    channel: order.paystack_channel,
    needsRefund: order.needs_refund,
    refundReason: order.refund_reason,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    items: items.map((i) => ({
      tierName: i.ticket_tiers?.name ?? "Unknown tier",
      quantity: i.quantity,
      unitPricePesewas: i.unit_price_pesewas,
    })),
    tickets: (tickets ?? []).map((t) => ({
      id: t.id,
      code: t.code,
      tierName: (t.ticket_tiers as unknown as { name: string } | null)?.name ?? "Unknown tier",
      status: t.status,
      checkedInAt: t.checked_in_at,
      voidReason: t.void_reason,
      refundedAt: t.refunded_at,
    })),
    deliveries: (deliveries ?? []).map((d) => ({
      id: d.id,
      channel: d.channel,
      status: d.status,
      recipient: d.recipient,
      attempts: d.attempts,
      error: d.error,
      createdAt: d.created_at,
      lastAttemptAt: d.last_attempt_at,
      exhausted: d.status === "failed" && d.attempts >= EXHAUSTED_AFTER,
    })),
  };
}

export type FailedDelivery = {
  id: string;
  channel: "sms" | "whatsapp" | "email";
  recipient: string;
  attempts: number;
  error: string | null;
  lastAttemptAt: string | null;
  exhausted: boolean;
  orderId: string | null;
  orderReference: string | null;
  buyerName: string | null;
  /** A broadcast message rather than someone's ticket. */
  broadcastId: string | null;
};

/**
 * The failed half of the outbox, newest first.
 *
 * Ticket deliveries come first regardless of age: a buyer with no ticket is a person who
 * will be turned away at the gate, which matters more than a missed announcement.
 */
export async function getFailedDeliveries(limit = 100): Promise<FailedDelivery[]> {
  const db = createAdminClient();

  const { data } = await db
    .from("message_deliveries")
    .select(
      `id, channel, recipient, attempts, error, last_attempt_at, order_id, broadcast_id,
       orders(paystack_reference, buyer_name)`,
    )
    .eq("status", "failed")
    .order("last_attempt_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  const rows = (data ?? []).map((d) => {
    const order = d.orders as unknown as {
      paystack_reference: string;
      buyer_name: string;
    } | null;
    return {
      id: d.id,
      channel: d.channel,
      recipient: d.recipient,
      attempts: d.attempts,
      error: d.error,
      lastAttemptAt: d.last_attempt_at,
      exhausted: d.attempts >= EXHAUSTED_AFTER,
      orderId: d.order_id,
      orderReference: order?.paystack_reference ?? null,
      buyerName: order?.buyer_name ?? null,
      broadcastId: d.broadcast_id,
    };
  });

  return rows.sort((a, b) => Number(Boolean(b.orderId)) - Number(Boolean(a.orderId)));
}
