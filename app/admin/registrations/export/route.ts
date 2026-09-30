import { type NextRequest } from "next/server";

import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseDayFilter, registrationSearchFilter } from "@/lib/admin/registrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CSV of door registrations. Follows both the night tab and the search, so the file holds
 * what the page was showing.
 *
 * A Route Handler, so the admin layout's requireAdmin() does NOT protect it — layouts
 * only wrap pages. The role check is repeated here, or this is an open dump of every
 * guest's email and phone.
 */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "admin") {
    return new Response("Not found", { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const day = parseDayFilter(params.get("day"));
  const search = registrationSearchFilter(params.get("q")?.trim() ?? "");

  const supabase = await createClient();
  let req = supabase
    .from("registrations")
    .select(
      "day, first_name, last_name, email, phone, occupation, heard_about, heard_about_other, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(20000);
  if (day !== "all") req = req.eq("day", day);
  if (search) req = req.or(search);

  const { data, error } = await req;
  if (error) return new Response(`Export failed: ${error.message}`, { status: 500 });

  const header = [
    "day", "first_name", "last_name", "email", "phone", "occupation", "heard_about", "heard_about_other", "registered_at",
  ];

  const rows = (data ?? []).map((r) => [
    String(r.day),
    r.first_name,
    r.last_name,
    r.email,
    r.phone,
    r.occupation,
    r.heard_about,
    r.heard_about_other ?? "",
    r.created_at,
  ]);

  const csv = [header, ...rows].map((r) => r.map(escapeCsv).join(",")).join("\r\n");
  const suffix = day === "all" ? "" : `-day-${day}`;

  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="registrations${suffix}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Quote every field and double internal quotes. The leading-character guard stops a
 * value like `=HYPERLINK(...)` typed into the form from executing when the file is opened
 * in Excel. It also catches `+`, so phone numbers come out as '+233…, which Excel shows
 * as text rather than mangling into a number.
 */
function escapeCsv(value: string): string {
  const risky = /^[=+\-@\t\r]/.test(value);
  const safe = risky ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
