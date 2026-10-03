"use server";

import { after } from "next/server";
import { z } from "zod";

import { payableOnline, toCurrency } from "@/lib/currency";
import { clientEnv, serverEnv } from "@/lib/env";
import { formatPesewas } from "@/lib/format";
import { messaging } from "@/lib/messaging";
import { composeTicketRequestEmail } from "@/lib/messaging/email";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkRequestPhone,
  validateTicketRequest,
  type TicketRequestErrors,
} from "@/lib/ticket-request";

export type TicketRequestResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: TicketRequestErrors };

// Shape only. What the values must be is `validateTicketRequest`, shared with the form.
const input = z.object({
  tierId: z.uuid(),
  name: z.string(),
  organisation: z.string(),
  email: z.string(),
  phone: z.string(),
  quantity: z.string(),
  message: z.string(),
  heardAbout: z.string(),
  heardAboutOther: z.string(),
});

/**
 * Records a request for a tier booked through the organiser, and emails them.
 *
 * Requesters are anonymous and `anon` has no grant on `ticket_requests`, so this writes
 * with the secret key — which makes this action the only way in, and its checks the ones
 * that count. It only accepts a tier that really is booked direct (published event,
 * active, priced in a currency checkout cannot take): the form is not the only thing that
 * can call it.
 *
 * The email goes after the response, so the requester is not kept waiting on Resend, and
 * carries their address as Reply-To. A failed send is logged and dropped — the request is
 * on the admin page regardless.
 */
export async function submitTicketRequest(raw: unknown): Promise<TicketRequestResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Something went wrong with the form. Reload and try again." };
  }

  const { tierId, ...fields } = parsed.data;
  const fieldErrors = validateTicketRequest(fields);
  const phone = checkRequestPhone(fields.phone);
  if (Object.keys(fieldErrors).length > 0 || !phone.ok) {
    return { ok: false, error: "Check the details marked below.", fieldErrors };
  }

  const db = createAdminClient();
  const { data: tier } = await db
    .from("ticket_tiers")
    .select("id, name, price_pesewas, currency, active, event_id, events!inner(name, status)")
    .eq("id", tierId)
    .maybeSingle();

  const event = tier?.events as unknown as { name: string; status: string } | undefined;
  if (
    !tier ||
    !tier.active ||
    event?.status !== "published" ||
    payableOnline(toCurrency(tier.currency))
  ) {
    return { ok: false, error: "That ticket can't be requested. Reload the page and try again." };
  }

  const other = fields.heardAbout === "Other" ? fields.heardAboutOther.trim() : "";
  const row = {
    event_id: tier.event_id,
    tier_id: tier.id,
    tier_name: tier.name,
    quantity: Number(fields.quantity),
    buyer_name: fields.name.trim(),
    buyer_email: fields.email.trim(),
    buyer_phone: phone.e164,
    organisation: fields.organisation.trim() || null,
    message: fields.message.trim() || null,
    heard_about: fields.heardAbout,
    heard_about_other: other || null,
  };

  const { data: saved, error } = await db
    .from("ticket_requests")
    .insert(row)
    .select("id")
    .single();
  if (error) {
    console.error("submitTicketRequest: insert failed", error);
    return { ok: false, error: "Your request was not sent. Try again." };
  }

  after(() =>
    notifyOrganiser(saved.id, {
      eventName: event.name,
      tierName: tier.name,
      quantity: row.quantity,
      priceEach: `${formatPesewas(tier.price_pesewas, toCurrency(tier.currency))} each`,
      name: row.buyer_name,
      organisation: row.organisation,
      email: row.buyer_email,
      phone: phone.display,
      message: row.message,
      heardAbout: other ? `Other: ${other}` : row.heard_about,
      adminLink: `${clientEnv().NEXT_PUBLIC_SITE_URL}/admin/requests`,
    }),
  );

  return { ok: true };
}

async function notifyOrganiser(
  id: string,
  props: Parameters<typeof composeTicketRequestEmail>[0],
) {
  const env = serverEnv();
  const recipient = env.REQUEST_NOTIFY_EMAIL ?? env.REGISTRATION_NOTIFY_EMAIL;
  if (!recipient) return;

  const email = composeTicketRequestEmail(props);
  const result = await messaging("email").send({
    channel: "email",
    recipient,
    subject: email.subject,
    body: email.text,
    react: email.react,
    replyTo: props.email,
    idempotencyKey: `ticket-request-${id}`,
  });

  if (!result.ok) console.error("submitTicketRequest: organiser email failed", result.error);
}
