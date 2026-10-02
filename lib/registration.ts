/**
 * Validation for door registration, shared by the form and the server action.
 *
 * The form runs it so a guest sees every mistake at once without a round trip; the action
 * runs it again because the form is not the only thing that can call the action. Limits
 * mirror the CHECK constraints on `public.registrations`.
 */
import { parsePhoneNumberFromString } from "libphonenumber-js";

import { normalizeGhanaPhone, formatGhanaPhone } from "@/lib/phone";
import { toPhoneCountry } from "@/lib/phone-countries";
import { HEARD_ABOUT_OPTIONS } from "@/lib/registration-days";

export type RegistrationFields = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** ISO code of the country picked beside the number: "GH", "US". */
  phoneCountry: string;
  occupation: string;
  heardAbout: string;
  /** Only read when `heardAbout` is "Other". */
  heardAboutOther: string;
  /** Who invited them. Optional; blank is saved as null. */
  invitedBy: string;
};

export type RegistrationErrors = Partial<Record<keyof RegistrationFields, string>>;

export const REGISTRATION_LIMITS = {
  name: 80,
  email: 254,
  occupation: 120,
  heardAboutOther: 200,
  invitedBy: 120,
} as const;

/**
 * Guests register in person, and the Day 3 crowd is the diaspora, so a UK or US number is
 * normal here. The guest picks their country beside the field and types the number the
 * way they would say it at home; a number typed or pasted with its own `+` (or `00`)
 * code wins over the picker.
 *
 * A Ghanaian number goes through checkout's own rules (mobile prefixes, `lib/phone.ts`).
 * Any other is checked against that country's real number plan by libphonenumber, so a
 * US number a digit short is caught rather than saved. `display` is how the number reads
 * back on the pass and in the organiser's email.
 */
export function checkRegistrationPhone(
  input: string,
  country: string,
): { ok: true; e164: string; display: string } | { ok: false; error: string } {
  let cleaned = input.replace(/[\s()\-.]/g, "");
  if (!cleaned) return { ok: false, error: "Enter your phone number" };
  if (cleaned.startsWith("00")) cleaned = `+${cleaned.slice(2)}`;

  const picked = toPhoneCountry(country);
  if (!picked) return { ok: false, error: "Choose your country" };

  const international = cleaned.startsWith("+");
  if (international ? cleaned.startsWith("+233") : picked === "GH") {
    const ghana = normalizeGhanaPhone(cleaned);
    return ghana.ok
      ? { ok: true, e164: ghana.e164, display: formatGhanaPhone(ghana.e164) }
      : { ok: false, error: ghana.error };
  }

  const parsed = international
    ? parsePhoneNumberFromString(cleaned)
    : parsePhoneNumberFromString(cleaned, picked);
  if (!parsed?.isValid()) {
    return {
      ok: false,
      error: international
        ? "Check the number and its country code"
        : "Check the number, or the country beside it",
    };
  }
  return { ok: true, e164: parsed.number, display: parsed.formatInternational() };
}

export function validateRegistration(fields: RegistrationFields): RegistrationErrors {
  const errors: RegistrationErrors = {};
  const { name, email, occupation, heardAboutOther, invitedBy } = REGISTRATION_LIMITS;

  if (!fields.firstName.trim()) errors.firstName = "Enter your first name";
  else if (fields.firstName.trim().length > name) errors.firstName = "That name is too long";

  if (!fields.lastName.trim()) errors.lastName = "Enter your last name";
  else if (fields.lastName.trim().length > name) errors.lastName = "That name is too long";

  const trimmedEmail = fields.email.trim();
  if (!trimmedEmail) errors.email = "Enter your email";
  else if (trimmedEmail.length > email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    errors.email = "That email is missing something, like name@example.com";
  }

  const phone = checkRegistrationPhone(fields.phone, fields.phoneCountry);
  if (!phone.ok) errors.phone = phone.error;

  if (!fields.occupation.trim()) errors.occupation = "Enter what you do";
  else if (fields.occupation.trim().length > occupation) {
    errors.occupation = "Keep it shorter, a few words is plenty";
  }

  if (!(HEARD_ABOUT_OPTIONS as readonly string[]).includes(fields.heardAbout)) {
    errors.heardAbout = "Choose how you heard about the event";
  } else if (
    fields.heardAbout === "Other" &&
    fields.heardAboutOther.trim().length > heardAboutOther
  ) {
    errors.heardAboutOther = "Keep it shorter, a few words is plenty";
  }

  if (fields.invitedBy.trim().length > invitedBy) {
    errors.invitedBy = "That name is too long";
  }

  return errors;
}
