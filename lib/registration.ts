/**
 * Validation for door registration, shared by the form and the server action.
 *
 * The form runs it so a guest sees every mistake at once without a round trip; the action
 * runs it again because the form is not the only thing that can call the action. Limits
 * mirror the CHECK constraints on `public.registrations`.
 */
import { normalizeGhanaPhone, formatGhanaPhone } from "@/lib/phone";
import { HEARD_ABOUT_OPTIONS } from "@/lib/registration-days";

export type RegistrationFields = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  occupation: string;
  heardAbout: string;
  /** Only read when `heardAbout` is "Other". */
  heardAboutOther: string;
};

export type RegistrationErrors = Partial<Record<keyof RegistrationFields, string>>;

export const REGISTRATION_LIMITS = {
  name: 80,
  email: 254,
  occupation: 120,
  heardAboutOther: 200,
} as const;

/**
 * Guests register in person, and the Day 3 crowd is the diaspora, so a UK or US number is
 * normal here. A Ghanaian number is normalised the way checkout does it; anything that
 * starts with a country code is kept as typed, as long as it has the digits of a real
 * number. `display` is how the number reads back on the pass.
 */
export function checkRegistrationPhone(
  input: string,
): { ok: true; e164: string; display: string } | { ok: false; error: string } {
  const cleaned = input.replace(/[\s()\-.]/g, "");
  if (!cleaned) return { ok: false, error: "Enter your phone number" };

  const ghana = normalizeGhanaPhone(cleaned);
  if (ghana.ok) return { ok: true, e164: ghana.e164, display: formatGhanaPhone(ghana.e164) };

  if (cleaned.startsWith("+") && !cleaned.startsWith("+233")) {
    return /^\+[1-9]\d{7,14}$/.test(cleaned)
      ? { ok: true, e164: cleaned, display: input.trim() }
      : { ok: false, error: "Check the number. Include the country code, like +44 7700 900123" };
  }
  return { ok: false, error: ghana.error };
}

export function validateRegistration(fields: RegistrationFields): RegistrationErrors {
  const errors: RegistrationErrors = {};
  const { name, email, occupation, heardAboutOther } = REGISTRATION_LIMITS;

  if (!fields.firstName.trim()) errors.firstName = "Enter your first name";
  else if (fields.firstName.trim().length > name) errors.firstName = "That name is too long";

  if (!fields.lastName.trim()) errors.lastName = "Enter your last name";
  else if (fields.lastName.trim().length > name) errors.lastName = "That name is too long";

  const trimmedEmail = fields.email.trim();
  if (!trimmedEmail) errors.email = "Enter your email";
  else if (trimmedEmail.length > email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    errors.email = "That email is missing something, like name@example.com";
  }

  const phone = checkRegistrationPhone(fields.phone);
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

  return errors;
}
