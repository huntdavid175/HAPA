import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { messaging } from "@/lib/messaging";
import type { Channel, SendRequest } from "@/lib/messaging/provider";
import {
  composeBroadcastEmail,
  composeTicketEmail,
  type EmailContent,
} from "@/lib/messaging/email";

export type WorkerResult = {
  claimed: number;
  sent: number;
  failed: number;
  /** Every provider used this run, e.g. "resend" or "resend+stub". */
  provider: string;
};

type Db = ReturnType<typeof createAdminClient>;

/** Exponential backoff: ~1m, 4m, 9m, 16m… Slow enough to ride out a provider outage. */
function backoffSeconds(attempts: number): number {
  return Math.min(attempts * attempts * 60, 3600);
}

/**
 * Drains a slice of the outbox.
 *
 * Deliberately bounded rather than "send everything": a 5,000-recipient broadcast cannot
 * fit in one serverless invocation, so the worker takes a batch per run and the schedule
 * provides the rest. Claiming uses FOR UPDATE SKIP LOCKED, so overlapping runs are safe.
 */
export async function runDeliveryWorker(limit = 50): Promise<WorkerResult> {
  const db = createAdminClient();
  const providersUsed = new Set<string>();
  const broadcastEmails = new Map<string, EmailContent>();

  const { data: claimed, error } = await db.rpc("claim_message_deliveries", {
    p_limit: limit,
  });
  if (error) throw error;

  const rows = claimed ?? [];
  let sent = 0;
  let failed = 0;
  const touchedBroadcasts = new Set<string>();

  for (const row of rows) {
    if (row.broadcast_id) touchedBroadcasts.add(row.broadcast_id);

    const channel = row.channel as Channel;
    const provider = messaging(channel);
    providersUsed.add(provider.name);

    const request: SendRequest = {
      channel,
      recipient: row.recipient,
      body: row.body,
      idempotencyKey: row.id,
    };

    if (channel === "email") {
      const email = row.broadcast_id
        ? await broadcastEmail(db, row.broadcast_id, row.body, broadcastEmails)
        : row.order_id
          ? await composeTicketEmail(db, row.order_id)
          : null;
      if (email) {
        request.subject = email.subject;
        request.react = email.react;
        request.body = email.text;
      }
    }

    // A ticket email for an order whose tickets were all voided since it was queued has
    // nothing left to say. Failing it outright beats sending an empty ticket.
    const result =
      channel === "email" && !request.subject
        ? ({ ok: false, error: "Nothing to send: no live tickets", retryable: false } as const)
        : await provider.send(request);

    if (result.ok) {
      sent++;
      await db
        .from("message_deliveries")
        .update({
          status: "sent",
          provider: provider.name,
          provider_message_id: result.providerMessageId,
          error: null,
        })
        .eq("id", row.id);
    } else {
      failed++;
      // A non-retryable failure (bad number, rejected template) is parked immediately by
      // exhausting its attempts — retrying it 4 more times just burns credit.
      const attempts = result.retryable ? row.attempts : 5;
      await db
        .from("message_deliveries")
        .update({
          status: "failed",
          provider: provider.name,
          error: result.error,
          attempts,
          next_attempt_at: new Date(
            Date.now() + backoffSeconds(row.attempts) * 1000,
          ).toISOString(),
        })
        .eq("id", row.id);
    }
  }

  for (const broadcastId of touchedBroadcasts) {
    await db.rpc("refresh_broadcast_counts", { p_broadcast_id: broadcastId });
  }

  return {
    claimed: rows.length,
    sent,
    failed,
    provider: [...providersUsed].join("+") || "none",
  };
}

/**
 * A broadcast's email content. Cached per run: a broadcast fans out to every buyer, and
 * each of their rows carries the same subject and event name.
 */
async function broadcastEmail(
  db: Db,
  broadcastId: string,
  body: string,
  cache: Map<string, EmailContent>,
): Promise<EmailContent | null> {
  const cached = cache.get(broadcastId);
  if (cached) return cached;

  const { data } = await db
    .from("broadcasts")
    .select("subject, events(name)")
    .eq("id", broadcastId)
    .maybeSingle();
  if (!data) return null;

  const eventName = (data.events as unknown as { name: string } | null)?.name ?? "the event";
  const email = composeBroadcastEmail({ subject: data.subject, body, eventName });
  cache.set(broadcastId, email);
  return email;
}
