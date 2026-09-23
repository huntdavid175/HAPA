"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { queueTicketResend } from "@/lib/messaging/ticket-message";

export type OrderActionState = {
  error: string | null;
  notice: string | null;
};

export const emptyOrderActionState: OrderActionState = { error: null, notice: null };

const uuid = z.uuid("Unknown record");

/** Re-render everywhere an order's state is visible, not just the page acted on. */
function revalidateOrderViews(orderId: string) {
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/failures");
  revalidatePath("/admin/buyers");
  revalidatePath("/admin");
}

/**
 * Queues the buyer's ticket message again.
 *
 * The body is rebuilt from the tickets as they stand right now, so a resend after a void
 * lists what the buyer actually still holds. Nothing leaves the building here — the row
 * goes into the outbox and the delivery worker picks it up on its next run.
 */
export async function resendTickets(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  await requireAdmin();

  const parsed = uuid.safeParse(formData.get("orderId"));
  if (!parsed.success) return { error: "Unknown order", notice: null };
  const orderId = parsed.data;

  const db = createAdminClient();

  const { data: order } = await db
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { error: "Unknown order", notice: null };
  if (order.status !== "paid") {
    return { error: "This order is not paid, so there is no ticket to send", notice: null };
  }

  try {
    const queued = await queueTicketResend(db, orderId);
    if (queued === 0) {
      return {
        error: "No live tickets on this order — every one of them has been voided",
        notice: null,
      };
    }
    revalidateOrderViews(orderId);
    return {
      error: null,
      notice: "Queued. The delivery worker sends it within a minute.",
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not queue the message",
      notice: null,
    };
  }
}

/**
 * Restarts one parked message.
 *
 * The worker gives up after 5 attempts and leaves the row `failed` so it stops burning
 * credit on a number that is not reachable. Resetting the counter is what un-parks it,
 * so this is deliberately a human decision rather than something the worker retries on
 * its own forever.
 */
export async function retryDelivery(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  await requireAdmin();

  const parsed = uuid.safeParse(formData.get("deliveryId"));
  if (!parsed.success) return { error: "Unknown message", notice: null };

  const db = createAdminClient();

  const { data: delivery } = await db
    .from("message_deliveries")
    .select("id, order_id, status")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!delivery) return { error: "Unknown message", notice: null };
  if (delivery.status !== "failed") {
    return { error: `This message is ${delivery.status}, not failed`, notice: null };
  }

  const { error } = await db
    .from("message_deliveries")
    .update({
      status: "queued",
      attempts: 0,
      error: null,
      next_attempt_at: new Date().toISOString(),
    })
    .eq("id", delivery.id)
    // Re-check the status in the UPDATE itself: two admins on the failure list at once
    // must not both hand the same row back to the worker.
    .eq("status", "failed");

  if (error) return { error: error.message, notice: null };

  if (delivery.order_id) revalidateOrderViews(delivery.order_id);
  else revalidatePath("/admin/failures");

  return { error: null, notice: "Back in the queue." };
}

const voidSchema = z.object({
  ticketId: z.uuid("Unknown ticket"),
  reason: z.string().trim().min(1, "Say why — this is the only record of it").max(200),
});

/**
 * Voids a single ticket.
 *
 * Voiding returns the seat to sale (`tier_availability` counts only issued and
 * checked-in tickets), so this is not merely a label — it puts stock back on the public
 * page. A checked-in ticket is refused: that person is already inside, the database
 * constraint would reject the transition anyway, and nulling their check-in to force it
 * through would destroy the only record that they were admitted.
 */
export async function voidTicket(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  await requireAdmin();

  const parsed = voidSchema.safeParse({
    ticketId: formData.get("ticketId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form", notice: null };
  }

  const db = createAdminClient();

  const { data: ticket } = await db
    .from("tickets")
    .select("id, order_id, code, status")
    .eq("id", parsed.data.ticketId)
    .maybeSingle();

  if (!ticket) return { error: "Unknown ticket", notice: null };
  if (ticket.status === "void") {
    return { error: null, notice: `${ticket.code} was already void.` };
  }
  if (ticket.status === "checked_in") {
    return {
      error: `${ticket.code} has already been admitted and cannot be voided`,
      notice: null,
    };
  }

  const { error } = await db
    .from("tickets")
    .update({ status: "void", void_reason: parsed.data.reason })
    .eq("id", ticket.id)
    .eq("status", "issued");

  if (error) return { error: error.message, notice: null };

  revalidateOrderViews(ticket.order_id);
  return { error: null, notice: `${ticket.code} voided. The seat is back on sale.` };
}

const refundSchema = z.object({
  orderId: z.uuid("Unknown order"),
  reason: z.string().trim().min(1, "Say why — this is the only record of it").max(200),
});

/**
 * Records that an order was refunded, and kills its tickets.
 *
 * v1 moves no money: the refund itself happens in the Paystack dashboard, and this is the
 * record of it plus the thing that stops the ticket working at the gate. Tickets already
 * checked in keep their status — they were used — but still get stamped, because the
 * money went back either way and the stamp is what explains the discrepancy later.
 */
export async function markOrderRefunded(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  await requireAdmin();

  const parsed = refundSchema.safeParse({
    orderId: formData.get("orderId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form", notice: null };
  }

  const { orderId, reason } = parsed.data;
  const db = createAdminClient();

  const { data: tickets } = await db
    .from("tickets")
    .select("id, status")
    .eq("order_id", orderId);

  if (!tickets) return { error: "Unknown order", notice: null };

  const refundedAt = new Date().toISOString();
  const admitted = tickets.filter((t) => t.status === "checked_in").length;

  // Stamp everything, void only what has not been used. Two statements rather than one,
  // because the check constraint forbids moving a checked-in ticket to void.
  const { error: stampError } = await db
    .from("tickets")
    .update({ refunded_at: refundedAt })
    .eq("order_id", orderId);
  if (stampError) return { error: stampError.message, notice: null };

  const { error: voidError } = await db
    .from("tickets")
    .update({ status: "void", void_reason: `Refunded: ${reason}` })
    .eq("order_id", orderId)
    .eq("status", "issued");
  if (voidError) return { error: voidError.message, notice: null };

  // Clearing needs_refund is the point of the flag: it exists to raise a hand, and this
  // is the hand being lowered.
  const { error: orderError } = await db
    .from("orders")
    .update({ needs_refund: false, refund_reason: reason })
    .eq("id", orderId);
  if (orderError) return { error: orderError.message, notice: null };

  revalidateOrderViews(orderId);

  const voided = tickets.length - admitted;
  return {
    error: null,
    notice:
      admitted > 0
        ? `Recorded. ${voided} ticket${voided === 1 ? "" : "s"} voided; ${admitted} had already been admitted and stay on the record as used.`
        : `Recorded. ${voided} ticket${voided === 1 ? "" : "s"} voided and the seats are back on sale.`,
  };
}
