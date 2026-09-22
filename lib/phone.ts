/**
 * Ghanaian phone number normalization.
 *
 * Buyers type their number however they say it aloud: 024 123 4567, 0241234567,
 * +233 24 123 4567, 233241234567. All of those are the same phone. The ticket is
 * delivered by SMS and WhatsApp, so a number that fails to normalize is a paying customer
 * who never receives anything — this is validated at the form, and again by a CHECK
 * constraint on orders.buyer_phone.
 */

/** Mobile prefixes in use in Ghana, without the leading 0. */
const MOBILE_PREFIXES = [
  "20", "50", // Telecel (formerly Vodafone)
  "24", "54", "55", "59", // MTN
  "27", "57", "26", "56", // AirtelTigo
  "23", "28", // Glo and others
];

export type PhoneResult =
  | { ok: true; e164: string }
  | { ok: false; error: string };

export function normalizeGhanaPhone(input: string): PhoneResult {
  // Strip everything a human might type as separators.
  const cleaned = input.replace(/[\s()\-.]/g, "");

  if (!cleaned) return { ok: false, error: "Enter your phone number" };
  if (!/^\+?\d+$/.test(cleaned)) {
    return { ok: false, error: "Phone number should contain digits only" };
  }

  let national: string;

  if (cleaned.startsWith("+233")) {
    national = cleaned.slice(4);
  } else if (cleaned.startsWith("233")) {
    national = cleaned.slice(3);
  } else if (cleaned.startsWith("0")) {
    national = cleaned.slice(1);
  } else if (cleaned.startsWith("+")) {
    // A foreign number. We cannot deliver an SMS to it via a Ghana sender ID reliably,
    // and silently accepting it would fail at send time instead of here.
    return { ok: false, error: "Enter a Ghanaian number, starting 0 or +233" };
  } else {
    national = cleaned;
  }

  if (national.length !== 9) {
    return {
      ok: false,
      error: "That does not look like a Ghanaian mobile number (e.g. 024 123 4567)",
    };
  }

  if (!MOBILE_PREFIXES.includes(national.slice(0, 2))) {
    return { ok: false, error: "That network prefix is not a Ghanaian mobile number" };
  }

  return { ok: true, e164: `+233${national}` };
}

/** 0241234567 — how a Ghanaian reads their own number back. */
export function formatGhanaPhone(e164: string): string {
  if (!e164.startsWith("+233")) return e164;
  const national = e164.slice(4);
  return `0${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
}
