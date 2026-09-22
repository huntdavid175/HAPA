import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { messaging } from "@/lib/messaging";
import type { Channel } from "@/lib/messaging/provider";

export type WorkerResult = {
  claimed: number;
  sent: number;
  failed: number;
  provider: string;
};

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
  const provider = messaging();

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

    const result = await provider.send({
      channel: row.channel as Channel,
      recipient: row.recipient,
      body: row.body,
    });

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

  return { claimed: rows.length, sent, failed, provider: provider.name };
}
