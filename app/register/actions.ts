"use server";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { getRegistrationDay } from "@/lib/registration-days";
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
  const phone = checkRegistrationPhone(fields.phone);
  if (Object.keys(fieldErrors).length > 0 || !phone.ok) {
    return { ok: false, error: "Check the details marked below.", fieldErrors };
  }

  const other = fields.heardAbout === "Other" ? fields.heardAboutOther.trim() : "";

  const { error } = await createAdminClient()
    .from("registrations")
    .insert({
      day: day.number,
      first_name: fields.firstName.trim(),
      last_name: fields.lastName.trim(),
      email: fields.email.trim(),
      phone: phone.e164,
      occupation: fields.occupation.trim(),
      heard_about: fields.heardAbout,
      heard_about_other: other || null,
    });

  if (error) {
    if (error.code === "23505") return { ok: true, alreadyRegistered: true };
    console.error("registerGuest: insert failed", error);
    return { ok: false, error: "Your registration was not saved. Try again." };
  }

  return { ok: true, alreadyRegistered: false };
}
