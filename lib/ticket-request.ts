/**
 * Validation for ticket requests (tiers booked through the organiser), shared by the
 * form and the server action. Limits mirror the CHECK constraints on
 * `public.ticket_requests`.
 */
import { checkRegistrationPhone } from "@/lib/registration";
import { HEARD_ABOUT_OPTIONS } from "@/lib/registration-days";

export type TicketRequestFields = {
  name: string;
  organisation: string;
  email: string;
  phone: string;
  quantity: string;
  message: string;
  heardAbout: string;
  heardAboutOther: string;
};

export type TicketRequestErrors = Partial<Record<keyof TicketRequestFields, string>>;

export const TICKET_REQUEST_LIMITS = {
  name: 120,
  organisation: 160,
  email: 254,
  message: 1000,
  heardAboutOther: 200,
  maxQuantity: 10,
} as const;

/**
 * Corporate buyers are often abroad, so the phone takes any country code; a number
 * without one is read as Ghanaian, the way checkout reads it.
 */
export function checkRequestPhone(input: string) {
  return checkRegistrationPhone(input, "GH");
}

export function validateTicketRequest(fields: TicketRequestFields): TicketRequestErrors {
  const errors: TicketRequestErrors = {};
  const limits = TICKET_REQUEST_LIMITS;

  const name = fields.name.trim();
  if (name.length < 2) errors.name = "Enter your full name";
  else if (name.length > limits.name) errors.name = "That name is too long";

  if (fields.organisation.trim().length > limits.organisation) {
    errors.organisation = "Keep it shorter";
  }

  const email = fields.email.trim();
  if (!email) errors.email = "Enter your email";
  else if (email.length > limits.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "That email is missing something, like name@example.com";
  }

  const phone = checkRequestPhone(fields.phone);
  if (!phone.ok) {
    errors.phone = fields.phone.trim().startsWith("+") || !fields.phone.trim()
      ? phone.error
      : `${phone.error}. Outside Ghana? Start with + and your country code.`;
  }

  const quantity = Number(fields.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > limits.maxQuantity) {
    errors.quantity = `Choose between 1 and ${limits.maxQuantity}`;
  }

  if (fields.message.trim().length > limits.message) {
    errors.message = `Keep it under ${limits.message} characters`;
  }

  if (!(HEARD_ABOUT_OPTIONS as readonly string[]).includes(fields.heardAbout)) {
    errors.heardAbout = "Choose how you heard about the event";
  } else if (
    fields.heardAbout === "Other" &&
    fields.heardAboutOther.trim().length > limits.heardAboutOther
  ) {
    errors.heardAboutOther = "Keep it shorter, a few words is plenty";
  }

  return errors;
}
