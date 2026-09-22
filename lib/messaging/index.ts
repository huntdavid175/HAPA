import "server-only";

import { serverEnv } from "@/lib/env";
import type { MessagingProvider } from "./provider";
import { StubProvider } from "./stub";

export type { MessagingProvider, SendRequest, SendResult, Channel } from "./provider";

let cached: MessagingProvider | undefined;

/**
 * Resolves the configured provider.
 *
 * MESSAGING_PROVIDER=stub is the default and sends nothing. Selecting "moolre" without
 * full credentials is already rejected at boot by lib/env.ts, so by the time this runs
 * the configuration is known-good.
 */
export function messaging(): MessagingProvider {
  if (cached) return cached;

  const provider = serverEnv().MESSAGING_PROVIDER;
  switch (provider) {
    case "moolre":
      // Deliberately not implemented. Writing this adapter from assumption is how you
      // discover at the venue that the payload shape was wrong — docs.moolre.com is a
      // JS-rendered SPA that has not been read yet, and no test message has been sent.
      throw new Error(
        "The Moolre adapter is not implemented yet. Confirm their API contract " +
          "(base URL, auth, SMS + WhatsApp payloads, rate limits) and send one real test " +
          "message before enabling it. Keep MESSAGING_PROVIDER=stub until then.",
      );
    case "stub":
    default:
      cached = new StubProvider();
      return cached;
  }
}
