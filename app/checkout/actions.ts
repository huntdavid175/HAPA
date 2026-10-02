"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeGhanaPhone } from "@/lib/phone";
import { buildReference, createPaymentLink } from "@/lib/moolre";
import { checkoutEnabled } from "@/lib/env";
import { ONLINE_CURRENCY } from "@/lib/currency";

export type CheckoutState = { error: string | null };

const schema = z.object({
  eventId: z.uuid(),
  name: z.string().trim().min(2, "Enter your full name").max(120),
  phone: z.string().trim().min(1, "Enter your phone number"),
  email: z.email("Enter a valid email address"),
  items: z
    .array(z.object({ tier_id: z.uuid(), quantity: z.number().int().min(1).max(20) }))
    .min(1, "Choose at least one ticket"),
});

/**
 * IP is hashed, never stored raw. It exists only to stop one source holding all the
 * stock; that does not require knowing where anybody is.
 */
async function hashedIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip");
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/** How long stock is held for a buyer at Moolre; the payment link expires with it. */
const HOLD_MINUTES = 10;

/**
 * Reserves stock, then sends the buyer to a Moolre payment link.
 *
 * The reservation comes first on purpose: taking a payment for tickets we might not have
 * is far worse than occasionally holding stock for a buyer who abandons. The hold lapses
 * by itself after ten minutes, and the link expires at the same moment.
 */
export async function startCheckout(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const rawItems = formData.get("items");
  let parsedItems: unknown = [];
  try {
    parsedItems = JSON.parse(typeof rawItems === "string" ? rawItems : "[]");
  } catch {
    return { error: "Something went wrong with your ticket selection" };
  }

  const parsed = schema.safeParse({
    eventId: formData.get("eventId"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    items: parsedItems,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details" };
  }

  const phone = normalizeGhanaPhone(parsed.data.phone);
  if (!phone.ok) return { error: phone.error };

  if (!checkoutEnabled()) {
    return {
      error:
        "Online payment is not switched on yet. Please contact the organizer to buy a ticket.",
    };
  }

  const db = createAdminClient();

  // Moolre settles cedis only. A dollar tier is "contact to book" on the page, but the
  // browser is not trusted to have shown that — check the tiers themselves, before
  // anything is held.
  const { data: tierRows, error: tierError } = await db
    .from("ticket_tiers")
    .select("id, currency")
    .in(
      "id",
      parsed.data.items.map((i) => i.tier_id),
    );
  if (tierError) return { error: "Could not check those tickets. Please try again." };
  if ((tierRows ?? []).some((t) => t.currency !== ONLINE_CURRENCY)) {
    return {
      error:
        "That ticket is booked directly with the organiser. See the bookings contacts on the event page.",
    };
  }

  const reference = buildReference();

  // Buyers are anonymous, so this runs under the secret key. reserve_tickets is what
  // actually enforces availability — under a row lock, not on trust.
  const { data: reserved, error: reserveError } = await db.rpc("reserve_tickets", {
    p_event_id: parsed.data.eventId,
    p_items: parsed.data.items,
    p_buyer_name: parsed.data.name,
    p_buyer_phone: phone.e164,
    p_buyer_email: parsed.data.email,
    p_reference: reference,
    p_ip_hash: (await hashedIp()) ?? undefined,
    p_hold_minutes: HOLD_MINUTES,
  });

  if (reserveError) {
    // These messages are written for buyers ("Only 2 left for VIP"), so pass them through.
    return { error: reserveError.message };
  }

  const order = reserved?.[0];
  if (!order) return { error: "Could not hold those tickets. Please try again." };

  // reserve_tickets settled the currency from the tiers; the check above means it is
  // cedis, but a dollar order reaching Moolre would be charged in the wrong unit.
  if (order.currency !== ONLINE_CURRENCY) {
    await db.from("orders").update({ status: "failed" }).eq("id", order.order_id);
    return { error: "That ticket is booked directly with the organiser." };
  }

  let paymentUrl: string;
  try {
    const link = await createPaymentLink({
      amountPesewas: order.total_pesewas,
      reference,
      expiresInMinutes: HOLD_MINUTES,
      metadata: { order_id: order.order_id },
    });
    paymentUrl = link.url;
  } catch (error) {
    // Release the hold immediately rather than leaving stock stranded for ten minutes
    // because Moolre was unreachable.
    await db.from("orders").update({ status: "failed" }).eq("id", order.order_id);
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Could not start payment: ${message}` };
  }

  redirect(paymentUrl);
}
