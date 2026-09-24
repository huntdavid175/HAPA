import "server-only";

import type { ReactElement } from "react";

import { BroadcastEmail } from "@/components/emails/broadcast-email";
import { TicketEmail, ticketAction, ticketIntro } from "@/components/emails/ticket-email";
import type { createAdminClient } from "@/lib/supabase/admin";
import { composeTicketMessage } from "./ticket-message";

type Db = ReturnType<typeof createAdminClient>;

/**
 * An email ready to hand to the provider: the React template plus a plain-text part.
 * The text is written out rather than left for Resend to derive from the HTML, so a
 * text-only client gets sentences, not a flattened layout.
 */
export type EmailContent = { subject: string; text: string; react: ReactElement };

/**
 * The buyer's ticket email, built from the order as it is now.
 *
 * Rebuilt at send time rather than stored with the outbox row, like the SMS text: a
 * resend after a ticket was voided describes what the buyer actually still holds.
 */
export async function composeTicketEmail(
  db: Db,
  orderId: string,
): Promise<EmailContent | null> {
  const ticket = await composeTicketMessage(db, orderId);
  if (!ticket) return null;

  const { eventName, codes, link } = ticket;
  const many = codes.length > 1;

  const subject = many
    ? `Your ${codes.length} tickets for ${eventName}`
    : `Your ticket for ${eventName}`;

  const text = [
    subject,
    "",
    ticketIntro(codes.length),
    "",
    `${many ? "Codes" : "Code"}: ${codes.join(", ")}`,
    "",
    `${ticketAction(codes.length)}: ${link}`,
  ].join("\n");

  // Called as a function, not written as JSX, per Resend's Next.js guide — and it keeps
  // this file plain TypeScript.
  return { subject, text, react: TicketEmail({ eventName, codes, link }) };
}

/** An organiser's broadcast. The inbox subject names the event; the heading need not. */
export function composeBroadcastEmail(input: {
  subject: string | null;
  body: string;
  eventName: string;
}): EmailContent {
  const custom = input.subject?.trim();

  return {
    subject: custom || `An update about ${input.eventName}`,
    text: input.body,
    react: BroadcastEmail({
      eventName: input.eventName,
      heading: custom || "An update",
      body: input.body,
    }),
  };
}
