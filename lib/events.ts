import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type TierRow = Database["public"]["Tables"]["ticket_tiers"]["Row"];

export type TierWithAvailability = TierRow & {
  available: number;
  sold: number;
  /** Why this tier cannot be bought right now, if it cannot. */
  unavailableReason: "sold_out" | "not_yet_on_sale" | "sales_ended" | null;
};

export type EventWithTiers = EventRow & { tiers: TierWithAvailability[] };

/**
 * Reads go through the RLS-scoped client on purpose.
 *
 * Which events the public may see is decided by the database, not by remembering to add
 * `.eq("status", "published")` at every call site. A draft event is invisible here because
 * `anon` has no policy that returns it — not because this function filtered it out.
 */
export async function getPublishedEvent(): Promise<EventWithTiers | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("status", "published")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return withTiers(data);
}

export async function getEventBySlug(slug: string): Promise<EventWithTiers | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return withTiers(data);
}

async function withTiers(event: EventRow): Promise<EventWithTiers> {
  const supabase = await createClient();

  const { data: tiers, error } = await supabase
    .from("ticket_tiers")
    .select("*")
    .eq("event_id", event.id)
    .eq("active", true)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;

  // Counting sold and held stock means reading `tickets` and `orders`, which anon has no
  // access to. This is the one elevated call on the public page, it runs server-side
  // only, and it returns nothing but integers.
  const admin = createAdminClient();
  const { data: availability, error: availError } = await admin.rpc("tier_availability", {
    p_event_id: event.id,
  });
  if (availError) throw availError;

  const byTier = new Map(availability?.map((a) => [a.tier_id, a]) ?? []);
  const now = Date.now();

  return {
    ...event,
    tiers: (tiers ?? []).map((tier) => {
      const stock = byTier.get(tier.id);
      const available = stock?.available ?? 0;
      const sold = stock?.sold ?? 0;

      let unavailableReason: TierWithAvailability["unavailableReason"] = null;
      if (tier.sales_start && new Date(tier.sales_start).getTime() > now) {
        unavailableReason = "not_yet_on_sale";
      } else if (tier.sales_end && new Date(tier.sales_end).getTime() < now) {
        unavailableReason = "sales_ended";
      } else if (available <= 0) {
        unavailableReason = "sold_out";
      }

      return { ...tier, available, sold, unavailableReason };
    }),
  };
}

/** True when nothing on this event can currently be bought. */
export function isFullyUnavailable(event: EventWithTiers): boolean {
  return (
    event.status !== "published" ||
    event.tiers.length === 0 ||
    event.tiers.every((t) => t.unavailableReason !== null)
  );
}
