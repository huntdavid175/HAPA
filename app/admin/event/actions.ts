"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { localInputToUtcIso } from "@/lib/datetime";

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
  description: z.string().trim().max(4000).default(""),
  venue: z.string().trim().max(300).default(""),
  // Validated as a URL so a typo shows up here rather than as a broken hero on the
  // buyer's first screen. Empty is allowed and means "no cover" — the page has a
  // gradient for that case.
  coverImage: z
    .union([z.literal(""), z.url("Enter a full image URL, starting http:// or https://")])
    .default(""),
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

  const { id, name, slug, description, venue, coverImage, startsAt, endsAt, timezone } =
    parsed.data;
  const supabase = await createClient();

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

  revalidatePath("/admin/event");
  revalidatePath("/");
  return { error: null, ok: "Saved" };
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
  // Entered in cedis; stored as integer pesewas.
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
    priceGhs: formData.get("priceGhs"),
    capacity: formData.get("capacity"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the tier", ok: null };
  }

  const { id, eventId, name, description, priceGhs, capacity } = parsed.data;

  // Round at the boundary so 35.005 can never become a fractional pesewa.
  const pricePesewas = Math.round(priceGhs * 100);

  const supabase = await createClient();
  const payload = {
    event_id: eventId,
    name,
    description,
    price_pesewas: pricePesewas,
    capacity,
  };

  const { error } = id
    ? await supabase.from("ticket_tiers").update(payload).eq("id", id)
    : await supabase.from("ticket_tiers").insert(payload);

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
