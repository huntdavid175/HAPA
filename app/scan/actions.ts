"use server";

import { requireStaffOrAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ScanOutcome = "valid" | "already_used" | "void" | "not_found" | "error";

export type ScanResult = {
  outcome: ScanOutcome;
  code: string | null;
  buyerName: string | null;
  tierName: string | null;
  checkedInAt: string | null;
  message: string;
};

export type LookupMatch = {
  ticketId: string;
  code: string;
  buyerName: string;
  tierName: string;
  status: string;
  checkedInAt: string | null;
};

/**
 * Check a ticket in.
 *
 * Authorization is here, in application code: the caller must be signed-in staff or
 * admin. Only after that do we act under the secret key, because door staff deliberately
 * have no RLS access to tickets or orders — they must not be able to read the buyer list
 * even indirectly.
 *
 * The single-use guarantee itself lives in the database (SELECT … FOR UPDATE), not in
 * this function.
 */
export async function checkInTicket(lookup: string): Promise<ScanResult> {
  const viewer = await requireStaffOrAdmin("/scan");

  const value = lookup.trim();
  if (!value) {
    return blank("error", "Nothing scanned.");
  }

  const db = createAdminClient();
  const { data, error } = await db.rpc("check_in_ticket", {
    p_lookup: value,
    p_staff: viewer.id,
  });

  if (error) {
    return blank("error", `Could not check in: ${error.message}`);
  }

  const row = data?.[0];
  if (!row) return blank("error", "No response from the database.");

  const base = {
    code: row.ticket_code,
    buyerName: row.buyer_name,
    tierName: row.tier_name,
    checkedInAt: row.checked_in_at,
  };

  switch (row.outcome) {
    case "valid":
      return { ...base, outcome: "valid", message: "Let them in" };
    case "already_used":
      return { ...base, outcome: "already_used", message: "This ticket was already used" };
    case "void":
      return { ...base, outcome: "void", message: "This ticket was cancelled" };
    default:
      return blank("not_found", "Not a valid ticket for this event");
  }
}

export async function lookupTickets(query: string): Promise<LookupMatch[]> {
  await requireStaffOrAdmin("/scan");

  const value = query.trim();
  if (value.length < 2) return [];

  const db = createAdminClient();

  const { data: event } = await db
    .from("events")
    .select("id")
    .in("status", ["published", "sales_closed"])
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!event) return [];

  const { data, error } = await db.rpc("lookup_tickets", {
    p_event: event.id,
    p_query: value,
  });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    ticketId: row.ticket_id,
    code: row.ticket_code,
    buyerName: row.buyer_name,
    tierName: row.tier_name,
    status: row.status,
    checkedInAt: row.checked_in_at,
  }));
}

function blank(outcome: ScanOutcome, message: string): ScanResult {
  return { outcome, code: null, buyerName: null, tierName: null, checkedInAt: null, message };
}
