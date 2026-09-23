import "server-only";

import { clientEnv } from "@/lib/env";
import type { createAdminClient } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminClient>;

/**
 * Composes the buyer's ticket message.
 *
 * One message per order, not per ticket: someone who bought four tickets is one person.
 * The body carries the link **and** the short codes, because at the gate the buyer may
 * have no data to open the link — the code is what lets staff check them in anyway.
 *
 * Built fresh from the current tickets every time it is called, so a resend after a void
 * describes what the buyer actually still holds rather than replaying the original text.
 */
export async function composeTicketMessage(
  db: Db,
  orderId: string,
): Promise<{ recipient: string; body: string } | null> {
  const { data: order } = await db
    .from("orders")
    .select("id, buyer_phone, events(name)")
    .eq("id", orderId)
    .single();
  if (!order) return null;

  const { data: tickets } = await db
    .from("tickets")
    .select("code, qr_token")
    .eq("order_id", orderId)
    .in("status", ["issued", "checked_in"])
    .order("code");
  if (!tickets?.length) return null;

  const site = clientEnv().NEXT_PUBLIC_SITE_URL;
  const eventName = (order.events as unknown as { name: string } | null)?.name ?? "the event";
  const link = `${site}/t/${tickets[0].qr_token}`;
  const codes = tickets.map((t) => t.code).join(", ");

  const body =
    tickets.length === 1
      ? `Your ticket for ${eventName}.\nCode: ${codes}\n${link}\n\nShow the QR or the code at the gate.`
      : `Your ${tickets.length} tickets for ${eventName}.\nCodes: ${codes}\n${link}\n\nOpen the link to see all of them. Show the QR or a code at the gate.`;

  return { recipient: order.buyer_phone, body };
}

/**
 * Queues the ticket message for a freshly paid order.
 *
 * Idempotent: a replayed webhook must not message the buyer twice, so an order that
 * already has any non-broadcast delivery row is left alone. An admin pressing "Resend"
 * deliberately bypasses this — see `queueTicketResend`.
 */
export async function queueTicketDelivery(db: Db, orderId: string): Promise<void> {
  const { count: existing } = await db
    .from("message_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .is("broadcast_id", null);
  if (existing && existing > 0) return;

  const message = await composeTicketMessage(db, orderId);
  if (!message) return;

  await db.from("message_deliveries").insert([
    { order_id: orderId, channel: "sms", recipient: message.recipient, body: message.body },
    { order_id: orderId, channel: "whatsapp", recipient: message.recipient, body: message.body },
  ]);
}

/**
 * Queues another copy on an admin's explicit say-so.
 *
 * Inserts new rows rather than resetting the old ones: "sent at 20:00, resent at 21:15"
 * is the record you want when a buyer is standing at the gate insisting nothing arrived.
 */
export async function queueTicketResend(db: Db, orderId: string): Promise<number> {
  const message = await composeTicketMessage(db, orderId);
  if (!message) return 0;

  const { error } = await db.from("message_deliveries").insert([
    { order_id: orderId, channel: "sms", recipient: message.recipient, body: message.body },
    { order_id: orderId, channel: "whatsapp", recipient: message.recipient, body: message.body },
  ]);
  if (error) throw error;

  return 2;
}
