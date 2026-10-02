import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentStatus } from "@/lib/moolre";
import { paymentsEnabled } from "@/lib/env";
import { formatPesewas } from "@/lib/format";
import { toCurrency } from "@/lib/currency";
import { OrderStatus } from "./status";

export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Where Moolre sends the buyer back to after paying.
 *
 * This page checks with Moolre for fast feedback, and issues tickets (idempotently) when
 * the money is there, but it does **not** queue their delivery — that is the webhook's
 * job alone. Mobile money often confirms after the buyer has already been redirected,
 * and plenty of buyers close the tab entirely, so anything that depended on this page
 * running would lose them their ticket.
 */
export default async function OrderPage({ params }: PageProps<"/order/[reference]">) {
  const { reference } = await params;
  const db = createAdminClient();

  const { data: order } = await db
    .from("orders")
    .select("id, status, total_pesewas, currency, buyer_name, buyer_phone, buyer_email, needs_refund, events(name)")
    .eq("paystack_reference", reference)
    .maybeSingle();

  if (!order) notFound();

  // Ask Moolre for an answer so a buyer who returns quickly is not told "pending" when
  // the money has already landed. Failure here is harmless — the webhook is
  // authoritative and will catch up regardless.
  //
  // Only "paid" changes anything. Moolre documents what success looks like and nothing
  // else, so a not-yet-paid answer is not read as failed: the stock hold lapses by
  // itself, and a late mobile-money confirmation still finds the order pending.
  if (order.status === "pending" && paymentsEnabled()) {
    try {
      const verified = await getPaymentStatus(reference);
      if (
        verified.paid &&
        verified.amountPesewas === order.total_pesewas &&
        order.currency === "GHS"
      ) {
        await db.rpc("issue_tickets_for_order", {
          p_order_id: order.id,
          p_channel: "moolre",
        });
      }
    } catch {
      // Ignore: the webhook remains the source of truth.
    }
  }

  const { data: tickets } = await db
    .from("tickets")
    .select("code, qr_token")
    .eq("order_id", order.id)
    .order("code");

  const eventName = (order.events as unknown as { name: string } | null)?.name ?? "the event";

  return (
    <OrderStatus
      reference={reference}
      eventName={eventName}
      buyerName={order.buyer_name}
      buyerPhone={order.buyer_phone}
      buyerEmail={order.buyer_email}
      amount={formatPesewas(order.total_pesewas, toCurrency(order.currency))}
      needsRefund={order.needs_refund}
      tickets={(tickets ?? []).map((t) => ({ code: t.code, token: t.qr_token }))}
    />
  );
}
