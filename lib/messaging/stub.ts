import "server-only";

import type { MessagingProvider, SendRequest, SendResult } from "./provider";

/**
 * Sends nothing. Records everything.
 *
 * This is the default provider, and it exists so the entire messaging pipeline —
 * queueing, batching, retries, the outbox UI, the failure dashboard — can be built and
 * exercised before any vendor account exists. Every send is recorded in
 * message_deliveries by the worker regardless of provider, so the stub simply reports
 * success and lets the row be the evidence.
 */
export class StubProvider implements MessagingProvider {
  readonly name = "stub";

  supports(): boolean {
    return true;
  }

  async send(request: SendRequest): Promise<SendResult> {
    console.info(
      `[messaging:stub] would send ${request.channel} to ${request.recipient}: ` +
        `${request.body.slice(0, 80)}${request.body.length > 80 ? "…" : ""}`,
    );
    return { ok: true, providerMessageId: `stub-${crypto.randomUUID()}` };
  }
}
