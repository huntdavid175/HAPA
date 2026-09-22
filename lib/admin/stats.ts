import "server-only";

import { createClient } from "@/lib/supabase/server";

export type TierStat = {
  id: string;
  name: string;
  pricePesewas: number;
  capacity: number;
  sold: number;
  held: number;
  available: number;
};

export type RecentOrder = {
  id: string;
  buyerName: string;
  buyerPhone: string;
  totalPesewas: number;
  createdAt: string;
  channel: string | null;
  ticketCount: number;
};

export type EventStats = {
  eventId: string;
  eventName: string;
  eventSlug: string;
  eventStatus: string;
  startsAt: string;
  timezone: string;
  ticketsSold: number;
  checkedIn: number;
  paidOrders: number;
  revenuePesewas: number;
  tiers: TierStat[];
  recentOrders: RecentOrder[];
  failedDeliveries: number;
  unprocessedWebhooks: number;
};

/**
 * Dashboard figures for the currently active event.
 *
 * Runs on the RLS-scoped client, so it returns what *this admin* is allowed to see rather
 * than everything in the database. Revenue counts paid orders only — a pending order is
 * money that has not arrived.
 */
export async function getEventStats(): Promise<EventStats | null> {
  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name, slug, status, starts_at, timezone")
    .in("status", ["published", "sales_closed"])
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event) return null;

  const [tiers, availability, tickets, checkedIn, orders, recent, failed, webhooks] =
    await Promise.all([
      supabase
        .from("ticket_tiers")
        .select("id, name, price_pesewas, capacity, position")
        .eq("event_id", event.id)
        .order("position", { ascending: true }),
      supabase.rpc("tier_availability", { p_event_id: event.id }),
      supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .in("status", ["issued", "checked_in"]),
      supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .eq("status", "checked_in"),
      supabase
        .from("orders")
        .select("total_pesewas")
        .eq("event_id", event.id)
        .eq("status", "paid"),
      supabase
        .from("orders")
        .select("id, buyer_name, buyer_phone, total_pesewas, created_at, paystack_channel, tickets(id)")
        .eq("event_id", event.id)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("message_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
      supabase
        .from("webhook_events")
        .select("id", { count: "exact", head: true })
        .is("processed_at", null),
    ]);

  const availabilityByTier = new Map(
    (availability.data ?? []).map((a) => [a.tier_id, a]),
  );

  return {
    eventId: event.id,
    eventName: event.name,
    eventSlug: event.slug,
    eventStatus: event.status,
    startsAt: event.starts_at,
    timezone: event.timezone,
    ticketsSold: tickets.count ?? 0,
    checkedIn: checkedIn.count ?? 0,
    paidOrders: orders.data?.length ?? 0,
    // Integer arithmetic only — never sum money as floats.
    revenuePesewas: (orders.data ?? []).reduce((sum, o) => sum + o.total_pesewas, 0),
    tiers: (tiers.data ?? []).map((t) => {
      const a = availabilityByTier.get(t.id);
      return {
        id: t.id,
        name: t.name,
        pricePesewas: t.price_pesewas,
        capacity: t.capacity,
        sold: a?.sold ?? 0,
        held: a?.held ?? 0,
        available: a?.available ?? t.capacity,
      };
    }),
    recentOrders: (recent.data ?? []).map((o) => ({
      id: o.id,
      buyerName: o.buyer_name,
      buyerPhone: o.buyer_phone,
      totalPesewas: o.total_pesewas,
      createdAt: o.created_at,
      channel: o.paystack_channel,
      ticketCount: Array.isArray(o.tickets) ? o.tickets.length : 0,
    })),
    failedDeliveries: failed.count ?? 0,
    unprocessedWebhooks: webhooks.count ?? 0,
  };
}
