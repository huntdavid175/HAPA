"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { isChannelLive } from "@/lib/messaging";
import { createClient } from "@/lib/supabase/server";
import { runDeliveryWorker } from "@/lib/messaging/worker";

export type BroadcastState = { error: string | null; ok: string | null };

const schema = z.object({
  eventId: z.uuid(),
  body: z
    .string()
    .trim()
    .min(1, "Write a message")
    // One GSM-7 SMS is 160 chars; longer messages split into billed segments. 480 is
    // three segments, which is a sane ceiling for an event announcement.
    .max(480, "Keep it under 480 characters — longer messages cost more to send"),
  channels: z.array(z.enum(["sms", "whatsapp", "email"])).min(1, "Pick at least one channel"),
  whatsappTemplate: z.string().trim().optional(),
  // Email only. Blank falls back to "An update about <event>" at send time.
  subject: z.string().trim().max(120, "Keep the subject under 120 characters").optional(),
  tierId: z.string().optional(),
  checkedIn: z.enum(["any", "yes", "no"]).default("any"),
});

/**
 * Creates the broadcast and fans it out into the outbox in one step.
 *
 * Nothing is sent here — enqueueing is instant, sending is the worker's job. That split
 * is what keeps a 5,000-recipient broadcast from timing out mid-send and leaving half the
 * audience messaged.
 */
export async function createBroadcast(
  _prev: BroadcastState,
  formData: FormData,
): Promise<BroadcastState> {
  await requireAdmin();

  const parsed = schema.safeParse({
    eventId: formData.get("eventId"),
    body: formData.get("body"),
    channels: formData.getAll("channels"),
    whatsappTemplate: formData.get("whatsappTemplate") || undefined,
    subject: formData.get("subject") || undefined,
    tierId: formData.get("tierId") || undefined,
    checkedIn: formData.get("checkedIn") || "any",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the message", ok: null };
  }

  const { eventId, body, channels, whatsappTemplate, subject, tierId, checkedIn } =
    parsed.data;

  // WhatsApp cannot carry free-form business-initiated messages. The database enforces
  // this too, but failing here gives a message the organizer can act on.
  // The page disables these, but the rule belongs here: a message on a channel with no
  // provider is recorded as sent and reaches nobody.
  const dead = channels.filter((c) => !isChannelLive(c));
  if (dead.length) {
    return {
      error: `${dead.map((c) => (c === "sms" ? "SMS" : c === "whatsapp" ? "WhatsApp" : "Email")).join(" and ")} ${dead.length === 1 ? "is" : "are"} not connected yet. Untick ${dead.length === 1 ? "it" : "them"} to send.`,
      ok: null,
    };
  }

  if (channels.includes("whatsapp") && !whatsappTemplate) {
    return {
      error:
        "WhatsApp needs a pre-approved template name. Meta does not allow free-form " +
        "announcements — use SMS for custom wording.",
      ok: null,
    };
  }

  // Shape must match what enqueue_broadcast() reads out of audience_filter.
  const audience: { tier_id?: string; checked_in?: boolean } = {};
  if (tierId) audience.tier_id = tierId;
  if (checkedIn !== "any") audience.checked_in = checkedIn === "yes";

  const supabase = await createClient();

  const { data: broadcast, error } = await supabase
    .from("broadcasts")
    .insert({
      event_id: eventId,
      channels,
      body,
      whatsapp_template: whatsappTemplate ?? null,
      subject: channels.includes("email") && subject ? subject : null,
      audience_filter: audience,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return { error: error.message, ok: null };

  const { data: queued, error: queueError } = await supabase.rpc("enqueue_broadcast", {
    p_broadcast_id: broadcast.id,
  });
  if (queueError) return { error: queueError.message, ok: null };

  revalidatePath("/admin/broadcasts");

  if (!queued) {
    return {
      error: null,
      ok: "Nothing queued — no paid buyers match that audience yet.",
    };
  }

  return {
    error: null,
    ok: `Queued for ${queued} message${queued === 1 ? "" : "s"}. Sending happens in the background.`,
  };
}

/**
 * Runs the outbox worker on demand.
 *
 * In production the schedule drives this; the button exists so the pipeline is
 * observable during development and so a stuck queue can be nudged on event night
 * without waiting for the next cron tick.
 */
export async function drainOutbox(
  _prev: BroadcastState,
  _formData: FormData,
): Promise<BroadcastState> {
  await requireAdmin();

  try {
    const result = await runDeliveryWorker(50);
    revalidatePath("/admin/broadcasts");

    if (result.claimed === 0) {
      return { error: null, ok: "Nothing waiting to send." };
    }
    const note =
      result.provider === "stub"
        ? " (stub provider — recorded, nothing actually sent)"
        : "";
    return {
      error: null,
      ok: `Processed ${result.claimed}: ${result.sent} sent, ${result.failed} failed${note}.`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: null };
  }
}
