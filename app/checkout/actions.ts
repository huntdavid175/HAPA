"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeGhanaPhone } from "@/lib/phone";
import {
  buildReference,
  checkoutCallbackUrl,
  initializeTransaction,
} from "@/lib/paystack";
import { paymentsEnabled } from "@/lib/env";

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

/**
 * Reserves stock, then opens a Paystack checkout.
 *
 * The reservation comes first on purpose: taking a payment for tickets we might not have
 * is far worse than occasionally holding stock for a buyer who abandons. The hold lapses
 * by itself after ten minutes.
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

  if (!paymentsEnabled()) {
    return {
      error:
        "Online payment is not switched on yet. Please contact the organizer to buy a ticket.",
    };
  }

  const db = createAdminClient();
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
    p_hold_minutes: 10,
  });

  if (reserveError) {
    // These messages are written for buyers ("Only 2 left for VIP"), so pass them through.
    return { error: reserveError.message };
  }

  const order = reserved?.[0];
  if (!order) return { error: "Could not hold those tickets. Please try again." };

  let authorizationUrl: string;
  try {
    const init = await initializeTransaction({
      email: parsed.data.email,
      amountPesewas: order.total_pesewas,
      reference,
      callbackUrl: checkoutCallbackUrl(reference),
      metadata: { order_id: order.order_id, buyer_name: parsed.data.name },
    });
    authorizationUrl = init.authorizationUrl;
  } catch (error) {
    // Release the hold immediately rather than leaving stock stranded for ten minutes
    // because Paystack was unreachable.
    await db.from("orders").update({ status: "failed" }).eq("id", order.order_id);
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Could not start payment: ${message}` };
  }

  redirect(authorizationUrl);
}
