import "server-only";

import type { ReactElement } from "react";

import { BroadcastEmail } from "@/components/emails/broadcast-email";
import {
  RegistrationConfirmationEmail,
  registrationConfirmationClosing,
  registrationConfirmationIntro,
  type RegistrationConfirmationEmailProps,
} from "@/components/emails/registration-confirmation-email";
import {
  RegistrationEmail,
  type RegistrationEmailProps,
} from "@/components/emails/registration-email";
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

/** The guest's confirmation that they are on the list for their night. */
export function composeRegistrationConfirmationEmail(
  input: RegistrationConfirmationEmailProps,
): EmailContent {
  const subject = input.date
    ? `You're registered for ${input.nightName} · ${input.date}`
    : `You're registered for ${input.nightName}`;

  const text = [
    `You're on the list, ${input.firstName}!`,
    "",
    registrationConfirmationIntro(input),
    "",
    `Night: ${input.nightName} (Day ${input.nightNumber})`,
    ...(input.date ? [`Date: ${input.date}`] : []),
    ...(input.venue ? [`Venue: ${input.venue}`] : []),
    `Registered as: ${input.fullName}`,
    `Phone: ${input.phone}`,
    "",
    registrationConfirmationClosing(),
    "",
    "See you there!",
  ].join("\n");

  return { subject, text, react: RegistrationConfirmationEmail(input) };
}

/** The organiser's note that someone has just registered at the door. */
export function composeRegistrationEmail(input: RegistrationEmailProps): EmailContent {
  const subject = `New registration · ${input.night} · ${input.name}`;

  const text = [
    `${input.name} registered for ${input.night}.`,
    "",
    `Email: ${input.email}`,
    `Phone: ${input.phone}`,
    `Occupation: ${input.occupation}`,
    `Heard about it: ${input.heardAbout}`,
    "",
    `All registrations: ${input.adminLink}`,
  ].join("\n");

  return { subject, text, react: RegistrationEmail(input) };
}
