import "server-only";

import { Resend } from "resend";

import type { Channel, MessagingProvider, SendRequest, SendResult } from "./provider";

/**
 * Email through Resend's SDK, as their Next.js guide sets it up.
 *
 * Each outbox row's id is the idempotency key, so the worker retrying a send whose
 * response was lost cannot put a second copy in someone's inbox.
 *
 * Their guide also adds a public `app/api/send` route. This app deliberately has none:
 * a route that emails whatever it is given is an open relay under your domain. The
 * delivery worker, behind CRON_SECRET, is the only thing that sends.
 */
export class ResendProvider implements MessagingProvider {
  readonly name = "resend";
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
    private readonly replyTo?: string,
  ) {
    this.client = new Resend(apiKey);
  }

  supports(channel: Channel): boolean {
    return channel === "email";
  }

  async send(request: SendRequest): Promise<SendResult> {
    if (request.channel !== "email") {
      return { ok: false, error: `Resend cannot send ${request.channel}`, retryable: false };
    }
    if (!request.subject) {
      return { ok: false, error: "Email has no subject", retryable: false };
    }

    // The SDK reports API failures in `error` rather than throwing. What it can still
    // throw is a network failure before any response — nothing is known to have been
    // sent then, and the idempotency key makes the retry safe even if it was.
    let result: Awaited<ReturnType<Resend["emails"]["send"]>>;
    try {
      result = await this.client.emails.send(
        {
          from: this.from,
          to: [request.recipient],
          subject: request.subject,
          text: request.body,
          ...(request.react ? { react: request.react } : {}),
          ...(this.replyTo ? { replyTo: this.replyTo } : {}),
        },
        request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : undefined,
      );
    } catch (error) {
      return {
        ok: false,
        error: `Could not reach Resend: ${error instanceof Error ? error.message : error}`,
        retryable: true,
      };
    }

    const { data, error } = result;
    if (!error) return { ok: true, providerMessageId: data?.id ?? null };

    // The key was already used with a different body: the first attempt went through and
    // the email was rebuilt since (a ticket voided in between, say). Sending again would
    // be the duplicate the key exists to prevent.
    if (error.name === "invalid_idempotent_request") {
      return { ok: true, providerMessageId: null };
    }

    return {
      ok: false,
      error: `Resend ${error.statusCode ?? ""} ${error.name}: ${error.message}`.trim(),
      retryable: RETRYABLE.has(error.name),
    };
  }
}

/**
 * Worth another go later. Everything else — an unverified domain, a malformed address, a
 * revoked key — fails the same way every time, so retrying only delays the failure
 * reaching the dashboard.
 */
const RETRYABLE = new Set<string>([
  "rate_limit_exceeded",
  "daily_quota_exceeded",
  "concurrent_idempotent_requests",
  "application_error",
  "internal_server_error",
]);
