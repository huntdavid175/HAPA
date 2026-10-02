"use server";

import { after } from "next/server";
import { z } from "zod";

import { clientEnv, serverEnv } from "@/lib/env";
import { messaging } from "@/lib/messaging";
import {
  composeRegistrationConfirmationEmail,
  composeRegistrationEmail,
} from "@/lib/messaging/email";
import { formatEventDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegistrationDay, type RegistrationDay } from "@/lib/registration-days";
import {
  checkRegistrationPhone,
  validateRegistration,
  type RegistrationErrors,
} from "@/lib/registration";

export type RegisterResult =
  | { ok: true; alreadyRegistered: boolean }
  | { ok: false; error: string; fieldErrors?: RegistrationErrors };

// Shape only. What the values must be is `validateRegistration`, shared with the form.
const input = z.object({
  daySlug: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string(),
  phoneCountry: z.string(),
  occupation: z.string(),
  heardAbout: z.string(),
  heardAboutOther: z.string(),
  invitedBy: z.string(),
});

/**
 * Saves one door registration.
 *
 * Guests are anonymous, and `anon` has no grant on `registrations`, so this writes with
 * the secret key — which makes this action the only way in, and the validation here the
 * one that counts.
 *
 * A second submit with the same email for the same night is not an error: it is the
 * guest who tapped twice, or who tried again because the first attempt looked stuck.
 * The unique index turns it away and the guest is told they are already on the list.
 *
 * A new registration is emailed to the guest, as their confirmation, and to the organiser,
 * both after the guest has their pass.
 */
export async function registerGuest(raw: unknown): Promise<RegisterResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Something went wrong with the form. Reload and try again." };
  }

  const { daySlug, ...fields } = parsed.data;
  const day = getRegistrationDay(daySlug);
  if (!day) return { ok: false, error: "That registration page does not exist." };

  const fieldErrors = validateRegistration(fields);
  const phone = checkRegistrationPhone(fields.phone, fields.phoneCountry);
  if (Object.keys(fieldErrors).length > 0 || !phone.ok) {
    return { ok: false, error: "Check the details marked below.", fieldErrors };
  }

  const other = fields.heardAbout === "Other" ? fields.heardAboutOther.trim() : "";

  const row = {
    day: day.number,
    first_name: fields.firstName.trim(),
    last_name: fields.lastName.trim(),
    email: fields.email.trim(),
    phone: phone.e164,
    occupation: fields.occupation.trim(),
    heard_about: fields.heardAbout,
    heard_about_other: other || null,
    invited_by: fields.invitedBy.trim() || null,
  };

  const { data, error } = await createAdminClient()
    .from("registrations")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: true, alreadyRegistered: true };
    console.error("registerGuest: insert failed", error);
    return { ok: false, error: "Your registration was not saved. Try again." };
  }

  // After the response, so the guest at the door is not kept waiting on Resend. Two
  // separate sends, so one failing does not stop the other.
  after(() => confirmToGuest(data.id, day, phone.display, row));
  after(() => notifyOrganiser(data.id, day, phone.display, row));

  return { ok: true, alreadyRegistered: false };
}

type SavedRow = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  occupation: string;
  heard_about: string;
  heard_about_other: string | null;
  invited_by: string | null;
};

/**
 * The guest's confirmation: their night, its date and the venue.
 *
 * The date is the night's calendar day at the venue, counted from the published event's
 * start — Day 1 is the day it starts, Day 2 the next — so it follows the event if the
 * organiser moves it. With nothing published the email still goes, without date or venue.
 *
 * Sent directly and not retried, like the organiser's: the registration stands either
 * way. A repeat submit never reaches here, so nobody gets two confirmations.
 */
async function confirmToGuest(
  id: string,
  day: RegistrationDay,
  phoneDisplay: string,
  row: SavedRow,
) {
  const { data: event } = await createAdminClient()
    .from("events")
    .select("name, venue, starts_at, timezone")
    .eq("status", "published")
    .maybeSingle();

  const nightStarts = event
    ? new Date(Date.parse(event.starts_at) + (day.number - 1) * 86_400_000).toISOString()
    : null;

  const email = composeRegistrationConfirmationEmail({
    firstName: row.first_name,
    fullName: `${row.first_name} ${row.last_name}`,
    nightName: day.name,
    nightNumber: day.number,
    date: event && nightStarts ? formatEventDate(nightStarts, event.timezone) : null,
    eventName: event?.name ?? null,
    venue: event?.venue || null,
    phone: phoneDisplay,
  });

  const result = await messaging("email").send({
    channel: "email",
    recipient: row.email,
    subject: email.subject,
    body: email.text,
    react: email.react,
    idempotencyKey: `registration-guest-${id}`,
  });

  if (!result.ok) console.error("registerGuest: guest confirmation failed", result.error);
}

/**
 * One email to the organiser per new registration.
 *
 * Sent directly, not through the outbox: the registration is saved and listed in the
 * admin whatever happens here, so a failed send is logged and dropped rather than
 * retried. The row id is the idempotency key, so a send whose response was lost and is
 * tried again cannot arrive twice.
 */
async function notifyOrganiser(
  id: string,
  day: RegistrationDay,
  phoneDisplay: string,
  row: SavedRow,
) {
  const recipient = serverEnv().REGISTRATION_NOTIFY_EMAIL;
  if (!recipient) return;

  const email = composeRegistrationEmail({
    night: `Night ${day.number} · ${day.name}`,
    name: `${row.first_name} ${row.last_name}`,
    email: row.email,
    phone: phoneDisplay,
    occupation: row.occupation,
    heardAbout: row.heard_about_other
      ? `${row.heard_about}: ${row.heard_about_other}`
      : row.heard_about,
    invitedBy: row.invited_by,
    adminLink: `${clientEnv().NEXT_PUBLIC_SITE_URL}/admin/registrations?day=${day.number}`,
  });

  const result = await messaging("email").send({
    channel: "email",
    recipient,
    subject: email.subject,
    body: email.text,
    react: email.react,
    idempotencyKey: `registration-${id}`,
  });

  if (!result.ok) console.error("registerGuest: organiser email failed", result.error);
}
