import { z } from "zod";

/**
 * Environment validation.
 *
 * Money and message delivery both depend on these values being correct, and a silently
 * missing key is far more expensive here than a crash: a blank PAYSTACK_SECRET_KEY means
 * every webhook signature check fails, which means paying customers get no ticket. So we
 * validate at boot (see instrumentation.ts) and refuse to start when something is wrong.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z
    .url()
    .refine((v) => !v.endsWith("/"), "must not have a trailing slash"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  // Supabase's current key format. The legacy `anon` JWT is deprecated (end of 2026) and
  // is rejected here on purpose: the prefix check is what catches a secret key pasted
  // into the browser-exposed slot.
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .startsWith(
      "sb_publishable_",
      "expected a Supabase publishable key (sb_publishable_…), not the legacy anon JWT",
    ),
  // Optional while payments are deferred. Still prefix-checked when present, so a wrong
  // key is caught at boot rather than at checkout.
  NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: z
    .string()
    .startsWith("pk_", "expected a Paystack public key (pk_test_… / pk_live_…)")
    .optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
});

const serverSchema = z
  .object({
    // Replaces the legacy service_role JWT. Bypasses RLS — server-side only.
    SUPABASE_SECRET_KEY: z
      .string()
      .startsWith(
        "sb_secret_",
        "expected a Supabase secret key (sb_secret_…), not the legacy service_role JWT",
      ),

    // Optional while payments are deferred — see requirePaystack() below, which is what
    // the checkout and webhook paths must call so a missing key fails loudly at the point
    // of use instead of silently taking a payment path with no credentials.
    PAYSTACK_SECRET_KEY: z
      .string()
      .startsWith("sk_", "expected a Paystack SECRET key (sk_test_… / sk_live_…)")
      .optional(),

    // Guards the hold-expiry sweeper and the delivery worker.
    CRON_SECRET: z.string().min(32, "use at least 32 chars of randomness"),

    MESSAGING_PROVIDER: z.enum(["stub", "moolre"]).default("stub"),
    MOOLRE_API_URL: z.url().optional(),
    MOOLRE_API_USER: z.string().optional(),
    MOOLRE_API_KEY: z.string().optional(),
    MOOLRE_ACCOUNT_NUMBER: z.string().optional(),
    MOOLRE_SENDER_ID: z.string().optional(),

    // Email is routed separately from SMS/WhatsApp, so tickets can go out by email while
    // the Moolre contract is still unconfirmed. "stub" records and sends nothing.
    EMAIL_PROVIDER: z.enum(["stub", "resend"]).default("stub"),
    RESEND_API_KEY: z
      .string()
      .startsWith("re_", "expected a Resend API key (re_…)")
      .optional(),
    // "HAPA Tickets <tickets@yourdomain.com>". The domain must be verified in Resend;
    // until it is, only onboarding@resend.dev works, and only to your own address.
    EMAIL_FROM: z.string().min(3).optional(),
    // Where a buyer's reply lands. Without it, replies go to the sending address.
    EMAIL_REPLY_TO: z.email().optional(),

    SENTRY_DSN: z.url().optional(),

    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  })
  // Selecting the real provider without its credentials would fail later, mid-send,
  // with half a broadcast delivered. Catch it at boot instead.
  .refine(
    (env) =>
      env.MESSAGING_PROVIDER !== "moolre" ||
      Boolean(
        env.MOOLRE_API_URL &&
          env.MOOLRE_API_USER &&
          env.MOOLRE_API_KEY &&
          env.MOOLRE_ACCOUNT_NUMBER &&
          env.MOOLRE_SENDER_ID,
      ),
    {
      error:
        'MESSAGING_PROVIDER="moolre" requires MOOLRE_API_URL, MOOLRE_API_USER, ' +
        "MOOLRE_API_KEY, MOOLRE_ACCOUNT_NUMBER and MOOLRE_SENDER_ID",
    },
  )
  .refine(
    (env) => env.EMAIL_PROVIDER !== "resend" || Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
    { error: 'EMAIL_PROVIDER="resend" requires RESEND_API_KEY and EMAIL_FROM' },
  );

export type ClientEnv = z.infer<typeof clientSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

function fail(scope: string, error: z.ZodError): never {
  const lines = error.issues.map((i) => {
    const path = i.path.join(".");
    return path ? `  - ${path}: ${i.message}` : `  - ${i.message}`;
  });
  throw new Error(
    `Invalid ${scope} environment:\n${lines.join("\n")}\n\nSee .env.example.`,
  );
}

/**
 * Next.js only inlines `process.env.NEXT_PUBLIC_*` when it appears as a static literal,
 * so these must be written out longhand rather than looped over.
 */
function readClientEnv(): ClientEnv {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
  });
  if (!parsed.success) fail("client", parsed.error);
  return parsed.data;
}

let clientCache: ClientEnv | undefined;
let serverCache: ServerEnv | undefined;

export function clientEnv(): ClientEnv {
  clientCache ??= readClientEnv();
  return clientCache;
}

export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() was called in the browser — this leaks secrets.");
  }
  if (!serverCache) {
    const parsed = serverSchema.safeParse(process.env);
    if (!parsed.success) fail("server", parsed.error);
    serverCache = parsed.data;
  }
  return serverCache;
}

/** Called from instrumentation.ts so a bad config fails the boot, not the first request. */
export function assertEnv(): void {
  clientEnv();
  serverEnv();
}

/** True when Paystack credentials are configured; drives the "payments not live" UI. */
export function paymentsEnabled(): boolean {
  return Boolean(serverEnv().PAYSTACK_SECRET_KEY);
}

/**
 * Call this at the top of any code path that is about to move money.
 *
 * Paystack is optional at boot while verification is pending, which means a checkout
 * route could otherwise run with no credentials and fail somewhere deep in a fetch. This
 * turns that into one clear error at the boundary.
 */
export function requirePaystack(): string {
  const key = serverEnv().PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not set — payments are not configured yet. " +
        "Add Paystack test keys to .env.local before using any checkout path.",
    );
  }
  return key;
}
