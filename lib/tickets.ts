import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type PublicTicket = {
  code: string;
  qrToken: string;
  status: "issued" | "checked_in" | "void";
  checkedInAt: string | null;
  buyerName: string;
  buyerEmail: string;
  tierName: string;
  eventName: string;
  eventVenue: string;
  eventStartsAt: string;
  eventEndsAt: string | null;
  eventTimezone: string;
  /** Artwork for the ticket's stub. A free-text URL an admin pasted, so it may 404. */
  eventCoverImage: string | null;
  /** Other tickets on the same order, so a group can page between them. */
  siblingTokens: string[];
};

/**
 * Loads a ticket by its opaque token.
 *
 * The token IS the authorization — buyers never sign in, so possession of the link is
 * what proves entitlement. It is 32 URL-safe characters from a CSPRNG and, importantly,
 * is a different value from the short human code: the code gets read aloud at the gate
 * and must not be enough to open someone's ticket.
 *
 * Runs under the secret key because `anon` has no access to tickets at all. The token
 * lookup is the only thing narrowing the query, so it must never be built from anything
 * other than the URL segment.
 */
export async function getTicketByToken(token: string): Promise<PublicTicket | null> {
  const db = createAdminClient();

  const { data, error } = await db
    .from("tickets")
    .select(
      `code, qr_token, status, checked_in_at, order_id,
       orders!inner(buyer_name, buyer_email, status),
       ticket_tiers!inner(name),
       events!inner(name, venue, starts_at, ends_at, timezone, cover_image)`,
    )
    .eq("qr_token", token)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // A ticket attached to an unpaid order should not render as a valid pass.
  const order = data.orders as unknown as {
    buyer_name: string;
    buyer_email: string;
    status: string;
  };
  if (order.status !== "paid") return null;

  const tier = data.ticket_tiers as unknown as { name: string };
  const event = data.events as unknown as {
    name: string;
    venue: string;
    starts_at: string;
    ends_at: string | null;
    timezone: string;
    cover_image: string | null;
  };

  const { data: siblings } = await db
    .from("tickets")
    .select("qr_token")
    .eq("order_id", data.order_id)
    .order("code");

  return {
    code: data.code,
    qrToken: data.qr_token,
    status: data.status,
    checkedInAt: data.checked_in_at,
    buyerName: order.buyer_name,
    buyerEmail: order.buyer_email,
    tierName: tier.name,
    eventName: event.name,
    eventVenue: event.venue,
    eventStartsAt: event.starts_at,
    eventEndsAt: event.ends_at,
    eventTimezone: event.timezone,
    eventCoverImage: event.cover_image,
    siblingTokens: (siblings ?? []).map((s) => s.qr_token),
  };
}
