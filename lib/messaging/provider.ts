import "server-only";

/**
 * The messaging port.
 *
 * Every message the platform sends — ticket delivery and broadcasts alike — goes through
 * this interface. The vendor behind it is not settled: Moolre covers SMS, sender IDs and
 * WhatsApp in one account, but their API contract has not been read yet. Keeping the
 * boundary here means confirming that contract costs one adapter file, not a rewrite.
 */

export type Channel = "sms" | "whatsapp" | "email";

export type SendRequest = {
  channel: Channel;
  /** E.164 for sms/whatsapp, an address for email. */
  recipient: string;
  body: string;
  /** Required for WhatsApp: business-initiated messages must use an approved template. */
  templateName?: string;
  templateVariables?: Record<string, string>;
  subject?: string;
};

export type SendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string; retryable: boolean };

export interface MessagingProvider {
  readonly name: string;
  /** Channels this provider is actually configured for right now. */
  supports(channel: Channel): boolean;
  send(request: SendRequest): Promise<SendResult>;
}
