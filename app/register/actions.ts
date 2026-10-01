"use server";

import { after } from "next/server";
import { z } from "zod";

import { clientEnv, serverEnv } from "@/lib/env";
import { messaging } from "@/lib/messaging";
import { composeRegistrationEmail } from "@/lib/messaging/email";
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
 * A new registration is emailed to the organiser after the guest has their pass.
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

  // After the response, so the guest at the door is not kept waiting on Resend.
  after(() => notifyOrganiser(data.id, day, phone.display, row));

  return { ok: true, alreadyRegistered: false };
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
  row: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    occupation: string;
    heard_about: string;
    heard_about_other: string | null;
  },
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
