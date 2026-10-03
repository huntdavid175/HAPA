import "server-only";

import { clientEnv, requireMoolre } from "@/lib/env";

/**
 * Moolre payment links, Ghana.
 *
 * The buyer pays on Moolre's hosted Web POS page (mobile money: MTN, Telecel, AT); we send them
 * there with a link created per order, and Moolre calls `/api/webhooks/moolre` when the
 * payment lands. Contract: docs.moolre.com/api/payments/links, …/status, …/webhook (the
 * plain-text copies are under docs.moolre.com/ai/live/).
 *
 * Two things differ from Paystack and shape everything that uses this file:
 *
 * - **Callbacks are not signed.** Moolre publishes the IPs it calls from and nothing
 *   else, so a callback is only ever a hint. `getPaymentStatus` — asked by us, with our
 *   key — is the only answer that grants tickets.
 * - **Amounts are major units, as strings** ("1500.00" is GH₵1,500). The database keeps
 *   pesewas, so this file converts at its edge and nowhere else.
 *
 * Moolre settles cedis only (GHS, and NGN, which this event does not use). A dollar tier
 * cannot be paid here; checkout refuses it before anything is reserved.
 */

export type PaymentLink = { url: string; reference: string };

export type PaymentStatus = {
  /**
   * Whether Moolre actually answered about the payment — `status: 1`, found or not (an
   * unknown reference is `SS07`, `txstatus: 3`). False means the lookup itself failed:
   * `IE01 INTERNAL ERROR` throughout the 3 Oct 2026 outage, when even a reference Moolre
   * had never seen got it. Not paid is only known when this is true.
   */
  answered: boolean;
  /** Only `true` is money in hand. Moolre documents 1 as successful and nothing else. */
  paid: boolean;
  /** Moolre's own number, as sent: 1 successful; any other value is not paid (yet). */
  txstatus: number | null;
  amountPesewas: number | null;
  externalref: string | null;
  transactionId: string | null;
  /** Moolre's code and message, for the webhook log. */
  code: string | null;
  message: string | null;
};

type Envelope<T> = { status?: number; code?: string; message?: string; data?: T };

async function call<T>(path: string, body: Record<string, unknown>): Promise<Envelope<T>> {
  const config = requireMoolre();
  const response = await fetch(`${config.apiUrl}${path}`, {
    method: "POST",
    headers: {
      "X-API-USER": config.user,
      "X-API-KEY": config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  let payload: Envelope<T>;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Moolre ${path} answered ${response.status} with no JSON`);
  }
  return payload;
}

/**
 * Creates the hosted payment page for one order.
 *
 * `reference` is our order's reference and Moolre's `externalref`: unique per order, and
 * what every callback and status check is matched on. A retry after a timeout must reuse
 * it — Moolre answers a repeat with "Transaction already exists" rather than a second
 * link, which is the protection against charging twice.
 *
 * The link expires with the stock hold, so a buyer cannot pay for tickets that have
 * already gone back on sale.
 */
export async function createPaymentLink(input: {
  amountPesewas: number;
  reference: string;
  expiresInMinutes: number;
  metadata?: Record<string, unknown>;
}): Promise<PaymentLink> {
  const config = requireMoolre();

  const payload = await call<{ authorization_url?: string; reference?: string }>(
    "/embed/link",
    {
      type: 1,
      amount: pesewasToAmount(input.amountPesewas),
      currency: "GHS",
      accountnumber: config.accountNumber,
      email: config.merchantEmail,
      externalref: input.reference,
      callback: moolreCallbackUrl(),
      redirect: checkoutReturnUrl(input.reference),
      reusable: "0",
      expiration_time: input.expiresInMinutes,
      metadata: { reference: input.reference, ...input.metadata },
    },
  );

  const url = payload.data?.authorization_url;
  if (payload.status !== 1 || !url) {
    throw new Error(payload.message ?? `Moolre could not create the payment link (${payload.code})`);
  }
  return { url, reference: payload.data?.reference ?? input.reference };
}

/**
 * Asks Moolre what happened to the payment with our reference.
 *
 * Always called before granting anything. The callback says what it says, but only this
 * answer — from Moolre, with our key — is authoritative about whether money arrived and
 * how much.
 */
export async function getPaymentStatus(reference: string): Promise<PaymentStatus> {
  const config = requireMoolre();

  const payload = await call<{
    txstatus?: number | string;
    amount?: string | number;
    externalref?: string;
    transactionid?: string | number;
  }>("/open/transact/status", {
    type: 1,
    idtype: 1, // 1 = our externalref, 2 = Moolre's own id
    id: reference,
    accountnumber: config.accountNumber,
  });

  const data = payload.data && !Array.isArray(payload.data) ? payload.data : undefined;
  const txstatus = data?.txstatus === undefined ? null : Number(data.txstatus);

  return {
    answered: payload.status === 1,
    paid: payload.status === 1 && txstatus === 1,
    txstatus,
    amountPesewas: data?.amount === undefined ? null : amountToPesewas(data.amount),
    externalref: data?.externalref ?? null,
    transactionId: data?.transactionid === undefined ? null : String(data.transactionid),
    code: payload.code ?? null,
    message: payload.message ?? null,
  };
}

/** 150000 pesewas → "1500.00". */
export function pesewasToAmount(pesewas: number): string {
  return (pesewas / 100).toFixed(2);
}

/** "1500" or "1500.00" → 150000. Rounded, because "0.1 + 0.2" is not a price. */
export function amountToPesewas(amount: string | number): number | null {
  const n = Number(amount);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Our own reference, so it is unique and recognisable in the Moolre dashboard. */
export function buildReference(): string {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `hapa_${stamp}_${random}`;
}

/** Where Moolre sends the buyer back to after paying. */
export function checkoutReturnUrl(reference: string): string {
  return `${clientEnv().NEXT_PUBLIC_SITE_URL}/order/${reference}`;
}

/** Where Moolre posts payment notifications. */
export function moolreCallbackUrl(): string {
  return `${clientEnv().NEXT_PUBLIC_SITE_URL}/api/webhooks/moolre`;
}
