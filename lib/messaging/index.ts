import "server-only";

import { serverEnv } from "@/lib/env";
import type { Channel, MessagingProvider } from "./provider";
import { ResendProvider } from "./resend";
import { StubProvider } from "./stub";

export type { MessagingProvider, SendRequest, SendResult, Channel } from "./provider";

let cachedText: MessagingProvider | undefined;
let cachedEmail: MessagingProvider | undefined;

/**
 * The provider for one channel.
 *
 * Email and SMS/WhatsApp are configured separately (EMAIL_PROVIDER, MESSAGING_PROVIDER)
 * because they come from different vendors and go live at different times: tickets can
 * go out by email through Resend while the Moolre contract is still being confirmed.
 * Misconfiguration of either is rejected at boot by lib/env.ts.
 */
export function messaging(channel: Channel): MessagingProvider {
  return channel === "email" ? emailProvider() : textProvider();
}

/** Whether a channel actually reaches people, as opposed to being recorded by the stub. */
export function isChannelLive(channel: Channel): boolean {
  return messaging(channel).name !== "stub";
}

function emailProvider(): MessagingProvider {
  if (cachedEmail) return cachedEmail;

  const env = serverEnv();
  cachedEmail =
    env.EMAIL_PROVIDER === "resend"
      ? new ResendProvider(env.RESEND_API_KEY!, env.EMAIL_FROM!, env.EMAIL_REPLY_TO)
      : new StubProvider();
  return cachedEmail;
}

function textProvider(): MessagingProvider {
  if (cachedText) return cachedText;

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
      cachedText = new StubProvider();
      return cachedText;
  }
}
