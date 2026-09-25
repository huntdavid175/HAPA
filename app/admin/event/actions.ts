"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { sanitizeRichText, isRichTextEmpty } from "@/lib/rich-text";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  COVER_BUCKET,
  COVER_MAX_BYTES,
  COVER_TYPES,
  coverPathFromUrl,
  isCoverType,
} from "@/lib/cover-image";
import { localInputToUtcIso } from "@/lib/datetime";
import { CURRENCIES } from "@/lib/currency";

export type ActionState = { error: string | null; ok: string | null };

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const eventSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Give the event a name").max(200),
  slug: z
    .string()
    .trim()
    .min(1, "Give the event a URL slug")
    .max(80)
    .regex(slugPattern, "Slug can only use lowercase letters, numbers and hyphens"),
  description: z.string().trim().max(20000).default(""),
  venue: z.string().trim().max(300).default(""),
  // An upload to the `event-covers` bucket, or the event's current cover left as it is
  // (checked below). Empty means "no cover" — the page has a plain header for that.
  coverImage: z.union([z.literal(""), z.url()]).default(""),
  // "2026-10-22T20:00" with no zone; interpreted as venue-local.
  startsAt: z.string().min(1, "Pick the date the event runs"),
  // Empty means no published end time, which the column allows.
  endsAt: z.union([z.literal(""), z.string().min(1)]).default(""),
  timezone: z.string().trim().min(1).default("Africa/Accra"),
});

export async function saveEvent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = eventSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description") ?? "",
    venue: formData.get("venue") ?? "",
    coverImage: formData.get("coverImage") ?? "",
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt") ?? "",
    timezone: formData.get("timezone") || "Africa/Accra",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form", ok: null };
  }

  const { id, name, slug, venue, coverImage, startsAt, endsAt, timezone } = parsed.data;

  // Sanitised on the way in, so the stored value is already safe to render and the
  // public page does not depend on remembering to clean it every time.
  const cleaned = sanitizeRichText(parsed.data.description);
  const description = isRichTextEmpty(cleaned) ? "" : cleaned;
  const supabase = await createClient();

  // Covers are uploaded, not pasted, so a new value has to be one of ours. A cover set
  // by URL before uploads existed is still accepted, but only unchanged.
  const { data: current } = id
    ? await supabase.from("events").select("cover_image").eq("id", id).maybeSingle()
    : { data: null };
  const previousCover = current?.cover_image ?? null;
  if (coverImage && coverImage !== previousCover && !coverPathFromUrl(coverImage)) {
    return { error: "Upload the cover image rather than linking to one", ok: null };
  }

  let startsAtIso: string;
  let endsAtIso: string | null = null;
  try {
    startsAtIso = localInputToUtcIso(startsAt, timezone);
    if (endsAt) endsAtIso = localInputToUtcIso(endsAt, timezone);
  } catch {
    return { error: "That date and time could not be read", ok: null };
  }

  // `events_ends_after_starts` enforces this in the database too, but a constraint
  // violation surfaces as an opaque error. Catching it here names the actual problem.
  if (endsAtIso && endsAtIso <= startsAtIso) {
    return { error: "The event has to end after it starts", ok: null };
  }

  const payload = {
    name,
    slug,
    description,
    venue,
    // Stored as null rather than "" so `cover_image ? ... : ...` on the public page is
    // the only check the renderer needs.
    cover_image: coverImage || null,
    starts_at: startsAtIso,
    ends_at: endsAtIso,
    timezone,
  };

  const { error } = id
    ? await supabase.from("events").update(payload).eq("id", id)
    : await supabase.from("events").insert(payload);

  if (error) {
    if (error.code === "23505") {
      return { error: `The slug “${slug}” is already used by another event`, ok: null };
    }
    return { error: error.message, ok: null };
  }

  // The replaced cover is no longer referenced by anything, so it goes. Only after the
  // save succeeded, and best effort: an orphaned file costs storage, not correctness.
  const previousPath =
    previousCover && previousCover !== (coverImage || null)
      ? coverPathFromUrl(previousCover)
      : null;
  if (previousPath) {
    await createAdminClient().storage.from(COVER_BUCKET).remove([previousPath]);
  }

  revalidatePath("/admin/event");
  revalidatePath("/");
  return { error: null, ok: "Saved" };
}

export type CoverUpload =
  | { error: string }
  | { error: null; path: string; token: string; publicUrl: string };

/**
 * Lets the browser upload one cover straight to Storage. The file never passes through
 * a server action, whose request body Next caps at 1 MB, and the browser gets a one-time
 * token for one path rather than any write access of its own. The bucket rechecks the
 * size and type when the upload lands.
 */
export async function createCoverUpload(type: string, size: number): Promise<CoverUpload> {
  await requireAdmin();

  if (!isCoverType(type)) return { error: "Use a JPEG, PNG, WebP or AVIF image" };
  if (!Number.isFinite(size) || size <= 0 || size > COVER_MAX_BYTES) {
    return { error: "Images can be up to 5 MB" };
  }

  const path = `${crypto.randomUUID()}.${COVER_TYPES[type]}`;
  const bucket = createAdminClient().storage.from(COVER_BUCKET);
  const { data, error } = await bucket.createSignedUploadUrl(path);
  if (error) return { error: error.message };

  return {
    error: null,
    path: data.path,
    token: data.token,
    publicUrl: bucket.getPublicUrl(data.path).data.publicUrl,
  };
}

const statusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["draft", "published", "sales_closed", "archived"]),
});

export async function setEventStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = statusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: "Unknown status change", ok: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id);

  if (error) {
    // events_one_published is a partial unique index, so this is the database refusing to
    // have two live events at once rather than a bug.
    if (error.code === "23505") {
      return {
        error: "Another event is already published. Unpublish it first.",
        ok: null,
      };
    }
    return { error: error.message, ok: null };
  }

  revalidatePath("/admin/event");
  revalidatePath("/");
  return { error: null, ok: "Updated" };
}

const tierSchema = z.object({
  id: z.uuid().optional(),
  eventId: z.uuid(),
  name: z.string().trim().min(1, "Give the tier a name").max(100),
  description: z.string().trim().max(500).default(""),
  // One benefit per line in the form. Blank lines are how people separate thoughts while
  // typing, so they are dropped rather than saved as empty bullets.
  benefits: z
    .string()
    .default("")
    .transform((raw) =>
      raw
        .split(/\r?\n/)
        .map((line) => line.replace(/^[-*•]\s*/, "").trim())
        .filter(Boolean),
    )
    .refine((list) => list.length <= 8, "Keep it to 8 benefits or fewer")
    .refine(
      (list) => list.every((line) => line.length <= 80),
      "Each benefit should be a short line, under 80 characters",
    ),
  // Checkbox: absent from the form data entirely when unticked.
  highlight: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  // The claim is the organiser's own words, so it is free text — but it sits in a pill
  // beside the tier name and wraps badly past a couple of words.
  badge: z.string().trim().max(24, "Keep the badge to a couple of words").default(""),
  currency: z.enum(CURRENCIES, "Choose cedis or US dollars"),
  // Entered in major units of `currency`; stored as integer minor units (pesewas/cents).
  priceGhs: z.coerce.number().positive("Price must be more than zero").max(100000),
  capacity: z.coerce.number().int().positive("Capacity must be at least 1").max(1000000),
});

export async function saveTier(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = tierSchema.safeParse({
    id: formData.get("id") || undefined,
    eventId: formData.get("eventId"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    benefits: formData.get("benefits") ?? "",
    highlight: formData.get("highlight") ?? false,
    badge: formData.get("badge") ?? "",
    currency: formData.get("currency") || "GHS",
    priceGhs: formData.get("priceGhs"),
    capacity: formData.get("capacity"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the tier", ok: null };
  }

  const {
    id,
    eventId,
    name,
    description,
    benefits,
    highlight,
    badge,
    currency,
    priceGhs,
    capacity,
  } = parsed.data;

  // Round at the boundary so 35.005 can never become a fractional pesewa.
  const pricePesewas = Math.round(priceGhs * 100);

  const supabase = await createClient();
  const payload = {
    event_id: eventId,
    name,
    description,
    benefits,
    highlight,
    // Empty means "highlighted, but making no claim", which is a real choice.
    badge: badge || null,
    // Existing orders snapshot their own currency, so changing it here never rewrites
    // what a past buyer paid.
    currency,
    price_pesewas: pricePesewas,
    capacity,
  };

  let error;
  if (id) {
    ({ error } = await supabase.from("ticket_tiers").update(payload).eq("id", id));
  } else {
    // A new tier joins the end of the list. Left at the column default of 0 it would tie
    // with every other tier, and the order buyers see would be whatever Postgres chose.
    const { data: last } = await supabase
      .from("ticket_tiers")
      .select("position")
      .eq("event_id", eventId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    ({ error } = await supabase
      .from("ticket_tiers")
      .insert({ ...payload, position: (last?.position ?? -1) + 1 }));
  }

  if (error) {
    if (error.code === "23505") {
      return { error: `There is already a tier called “${name}”`, ok: null };
    }
    return { error: error.message, ok: null };
  }

  revalidatePath("/admin/event");
  revalidatePath("/");
  return { error: null, ok: "Tier saved" };
}

export async function deactivateTier(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string") return { error: "Unknown tier", ok: null };

  const supabase = await createClient();

  // Never hard-delete: order_items reference tiers, and a deleted tier would erase what a
  // past buyer actually purchased. Deactivating just removes it from sale.
  const { error } = await supabase
    .from("ticket_tiers")
    .update({ active: false })
    .eq("id", id);
  if (error) return { error: error.message, ok: null };

  revalidatePath("/admin/event");
  revalidatePath("/");
  return { error: null, ok: "Tier removed from sale" };
}

const reorderSchema = z.object({
  eventId: z.uuid(),
  ids: z.array(z.uuid()).min(1).max(100),
});

/**
 * Writes the admin's drag order to `position`, which is the order the public page reads.
 * Rows are updated one by one rather than in a transaction: a partial failure leaves a
 * mixed order, never a broken one, and the next drag rewrites every position anyway.
 */
export async function reorderTiers(eventId: string, ids: string[]): Promise<ActionState> {
  await requireAdmin();

  const parsed = reorderSchema.safeParse({ eventId, ids });
  if (!parsed.success) return { error: "That order could not be saved", ok: null };

  const supabase = await createClient();
  const results = await Promise.all(
    parsed.data.ids.map((id, position) =>
      supabase
        .from("ticket_tiers")
        .update({ position })
        .eq("id", id)
        .eq("event_id", parsed.data.eventId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message, ok: null };

  revalidatePath("/admin/event");
  revalidatePath("/");
  return { error: null, ok: "Order saved" };
}
