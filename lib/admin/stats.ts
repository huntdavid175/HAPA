import "server-only";

import { createClient } from "@/lib/supabase/server";
import { toCurrency, type Currency } from "@/lib/currency";
import type { Price } from "@/lib/pricing";

export type TierStat = {
  id: string;
  name: string;
  pricePesewas: number;
  currency: Currency;
  capacity: number;
  /** False once removed from sale. Still listed: its sales are still money taken. */
  active: boolean;
  /**
   * What this tier has brought in, from the paid order lines at the price each buyer
   * actually paid — not sold × today's price, which is wrong once a price has changed.
   * One entry per order line; `formatTotals` keeps currencies apart.
   */
  revenue: Price[];
  sold: number;
  held: number;
  available: number;
};

export type RecentOrder = {
  id: string;
  buyerName: string;
  buyerPhone: string;
  totalPesewas: number;
  currency: Currency;
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
  /**
   * One entry per paid order, in that order's currency. Kept apart rather than summed:
   * cedis and dollars do not add up, so `formatTotals` shows one total per currency.
   */
  revenue: Price[];
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

  const [tiers, availability, tickets, checkedIn, orders, recent, failed, webhooks, lines] =
    await Promise.all([
      supabase
        .from("ticket_tiers")
        .select("id, name, price_pesewas, currency, capacity, position, active")
        .eq("event_id", event.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
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
        .select("total_pesewas, currency")
        .eq("event_id", event.id)
        .eq("status", "paid"),
      supabase
        .from("orders")
        .select(
          "id, buyer_name, buyer_phone, total_pesewas, currency, created_at, paystack_channel, tickets(id)",
        )
        .eq("event_id", event.id)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("message_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
      supabase
        .from("webhook_events")
        .select("id", { count: "exact", head: true })
        .is("processed_at", null),
      supabase
        .from("order_items")
        .select("tier_id, quantity, unit_price_pesewas, orders!inner(status, currency, event_id)")
        .eq("orders.event_id", event.id)
        .eq("orders.status", "paid"),
    ]);

  const revenueByTier = new Map<string, Price[]>();
  for (const line of lines.data ?? []) {
    const order = line.orders as unknown as { currency: string };
    const entries = revenueByTier.get(line.tier_id) ?? [];
    entries.push({
      pesewas: line.unit_price_pesewas * line.quantity,
      currency: toCurrency(order.currency),
    });
    revenueByTier.set(line.tier_id, entries);
  }

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
    revenue: (orders.data ?? []).map((o) => ({
      pesewas: o.total_pesewas,
      currency: toCurrency(o.currency),
    })),
    tiers: (tiers.data ?? []).map((t) => {
      const a = availabilityByTier.get(t.id);
      return {
        id: t.id,
        name: t.name,
        pricePesewas: t.price_pesewas,
        currency: toCurrency(t.currency),
        capacity: t.capacity,
        active: t.active,
        revenue: revenueByTier.get(t.id) ?? [],
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
      currency: toCurrency(o.currency),
      createdAt: o.created_at,
      channel: o.paystack_channel,
      ticketCount: Array.isArray(o.tickets) ? o.tickets.length : 0,
    })),
    failedDeliveries: failed.count ?? 0,
    unprocessedWebhooks: webhooks.count ?? 0,
  };
}
