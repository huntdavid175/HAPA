import { type NextRequest } from "next/server";

import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CSV of buyers for the organizer's own records.
 *
 * This is a Route Handler, so the admin layout's requireAdmin() does NOT protect it —
 * layouts only wrap pages. The role check has to be repeated here, or this becomes an
 * unauthenticated dump of every buyer's phone number.
 */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "admin") {
    return new Response("Not found", { status: 404 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const supabase = await createClient();

  let req = supabase
    .from("orders")
    .select(
      "buyer_name, buyer_phone, buyer_email, total_pesewas, currency, status, paystack_channel, created_at, tickets(id, status)",
    )
    .order("created_at", { ascending: false });

  if (query) {
    const safe = query.replace(/[,()]/g, " ");
    req = req.or(
      `buyer_name.ilike.%${safe}%,buyer_phone.ilike.%${safe}%,buyer_email.ilike.%${safe}%`,
    );
  }

  const { data, error } = await req;
  if (error) return new Response(`Export failed: ${error.message}`, { status: 500 });

  const header = [
    // `amount` is in `currency`. It was `amount_ghs` until tiers could be priced in
    // dollars; a single amount column with no currency would sum cedis and dollars.
    "name", "phone", "email", "tickets", "checked_in", "amount", "currency", "status", "channel", "purchased_at",
  ];

  const rows = (data ?? []).map((o) => {
    const tickets = Array.isArray(o.tickets) ? o.tickets : [];
    return [
      o.buyer_name,
      o.buyer_phone,
      o.buyer_email,
      String(tickets.length),
      String(tickets.filter((t) => t.status === "checked_in").length),
      (o.total_pesewas / 100).toFixed(2),
      o.currency,
      o.status,
      o.paystack_channel ?? "",
      o.created_at,
    ];
  });

  const csv = [header, ...rows].map((r) => r.map(escapeCsv).join(",")).join("\r\n");

  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="buyers-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Quote every field and double internal quotes. The leading-character guard stops a
 * value like `=HYPERLINK(...)` in a buyer's name from executing when the organizer opens
 * the file in Excel.
 */
function escapeCsv(value: string): string {
  const risky = /^[=+\-@\t\r]/.test(value);
  const safe = risky ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
