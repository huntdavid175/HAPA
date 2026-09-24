import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { requirePaystack, clientEnv } from "@/lib/env";
import type { Currency } from "@/lib/currency";

/**
 * Paystack, Ghana.
 *
 * Amounts are integer minor units — GHS 50.00 is 5000 pesewas, USD 50.00 is 5000 cents.
 * Paystack takes the minor unit for both, which is the same unit the database stores, so
 * nothing converts anywhere in this file.
 */

const API = "https://api.paystack.co";

export type InitializeResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

export type VerifyResult = {
  status: string;
  amountPesewas: number;
  currency: string;
  channel: string | null;
  paidAt: string | null;
  reference: string;
};

/**
 * Opens a hosted checkout. Cedi checkouts include mobile money because that is how most
 * Ghanaian buyers pay; Paystack shows the network picker and sends the PIN prompt. Mobile
 * money only moves cedis, so a dollar checkout is card only — offering it would show a
 * method that fails.
 *
 * A USD charge also needs USD enabled on the Paystack account. Until it is, Paystack
 * rejects the initialize call and the buyer sees that message instead of a checkout.
 */
export async function initializeTransaction(input: {
  email: string;
  amountPesewas: number;
  currency: Currency;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<InitializeResult> {
  const secret = requirePaystack();

  const response = await fetch(`${API}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountPesewas,
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      channels: input.currency === "GHS" ? ["mobile_money", "card"] : ["card"],
      metadata: input.metadata ?? {},
    }),
    cache: "no-store",
  });

  const payload = await response.json();
  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message ?? `Paystack initialize failed (${response.status})`);
  }

  return {
    authorizationUrl: payload.data.authorization_url,
    accessCode: payload.data.access_code,
    reference: payload.data.reference,
  };
}

/**
 * Asks Paystack what actually happened.
 *
 * Always called before granting anything — the webhook payload says what it says, but
 * only this answer is authoritative about whether money arrived and how much.
 */
export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  const secret = requirePaystack();

  const response = await fetch(`${API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
  });

  const payload = await response.json();
  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message ?? `Paystack verify failed (${response.status})`);
  }

  return {
    status: payload.data.status,
    amountPesewas: payload.data.amount,
    currency: payload.data.currency,
    channel: payload.data.channel ?? null,
    paidAt: payload.data.paid_at ?? null,
    reference: payload.data.reference,
  };
}

/**
 * Verifies the `x-paystack-signature` header: HMAC-SHA512 of the **raw** body, keyed with
 * the secret key, hex encoded.
 *
 * Must run against the exact bytes received. Parsing the JSON first and re-serializing it
 * changes whitespace and key order, and the signature will never match.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;

  const secret = requirePaystack();
  const expected = createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  // timingSafeEqual throws on a length mismatch, so compare lengths first. The length
  // itself is not secret; the contents are.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Our own reference, so it is unique and recognisable in the Paystack dashboard. */
export function buildReference(): string {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `hapa_${stamp}_${random}`;
}

export function checkoutCallbackUrl(reference: string): string {
  return `${clientEnv().NEXT_PUBLIC_SITE_URL}/order/${reference}`;
}
