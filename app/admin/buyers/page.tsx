import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, DownloadIcon, SearchIcon, UsersIcon, XIcon } from "lucide-react";
import { cn } from "cn";

import { createClient } from "@/lib/supabase/server";
import { formatPesewas, formatRelativeTime, formatTimestamp } from "@/lib/format";
import { toCurrency } from "@/lib/currency";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Buyers" };
export const dynamic = "force-dynamic";

/**
 * Order statuses grouped the way an organiser thinks about them. "failed" and "expired"
 * are the same thing from the door: someone started and did not pay.
 */
const VIEWS = [
  { key: "all", label: "All", statuses: null },
  { key: "paid", label: "Paid", statuses: ["paid"] },
  { key: "pending", label: "In checkout", statuses: ["pending"] },
  { key: "unpaid", label: "Didn't finish", statuses: ["failed", "expired"] },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-success/15 text-success" },
  pending: { label: "In checkout", className: "bg-warning/15 text-warning" },
  failed: { label: "Didn't finish", className: "bg-muted text-muted-foreground" },
  expired: { label: "Didn't finish", className: "bg-muted text-muted-foreground" },
};

export default async function BuyersPage({ searchParams }: PageProps<"/admin/buyers">) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const viewKey: ViewKey = VIEWS.some((v) => v.key === params.status)
    ? (params.status as ViewKey)
    : "all";
  const view = VIEWS.find((v) => v.key === viewKey)!;

  const supabase = await createClient();

  // Escape PostgREST's or() delimiters so a comma or paren in the search can't alter the
  // filter expression.
  const safe = query.replace(/[,()]/g, " ");
  const searchFilter = `buyer_name.ilike.%${safe}%,buyer_phone.ilike.%${safe}%,buyer_email.ilike.%${safe}%`;

  let listRequest = supabase
    .from("orders")
    .select(
      "id, buyer_name, buyer_phone, buyer_email, total_pesewas, currency, status, created_at, tickets(id, status)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (query) listRequest = listRequest.or(searchFilter);
  if (view.statuses) listRequest = listRequest.in("status", [...view.statuses]);

  // Counts for the tabs, under the same search, so "Paid 3" means three paid matches.
  let countRequest = supabase.from("orders").select("status").limit(5000);
  if (query) countRequest = countRequest.or(searchFilter);

  const [{ data: orders, error }, { data: statuses }, { data: event }] = await Promise.all([
    listRequest,
    countRequest,
    supabase
      .from("events")
      .select("timezone")
      .not("status", "eq", "archived")
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (error) throw error;

  const rows = orders ?? [];
  const tz = event?.timezone ?? "Africa/Accra";
  const counts = Object.fromEntries(
    VIEWS.map((v) => [
      v.key,
      (statuses ?? []).filter((o) =>
        v.statuses ? (v.statuses as readonly string[]).includes(o.status) : true,
      ).length,
    ]),
  ) as Record<ViewKey, number>;

  const href = (next: { q?: string; status?: ViewKey }) => {
    const sp = new URLSearchParams();
    const q = next.q ?? query;
    const status = next.status ?? viewKey;
    if (q) sp.set("q", q);
    if (status !== "all") sp.set("status", status);
    const s = sp.toString();
    return `/admin/buyers${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Buyers</h1>
          <p className="text-muted-foreground text-sm">
            Every order, paid or not. Open one to resend tickets, void or refund.
          </p>
        </div>

        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link
              href={`/admin/buyers/export${query ? `?q=${encodeURIComponent(query)}` : ""}`}
              prefetch={false}
            />
          }
        >
          <DownloadIcon data-icon="inline-start" />
          Export CSV
        </Button>
      </div>

      <Card className="gap-0 py-0">
        {/* Toolbar: which orders, then which people. */}
        <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Filter by status" className="flex flex-wrap gap-1">
            {VIEWS.map((v) => {
              const active = v.key === viewKey;
              return (
                <Link
                  key={v.key}
                  href={href({ status: v.key })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {v.label}
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {counts[v.key]}
                  </span>
                </Link>
              );
            })}
          </nav>

          <form role="search" className="relative w-full sm:w-72">
            <label htmlFor="q" className="sr-only">
              Search by name, phone or email
            </label>
            {viewKey !== "all" ? <input type="hidden" name="status" value={viewKey} /> : null}
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              id="q"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Search name, phone or email"
              className="pr-9 pl-9"
            />
            {query ? (
              <Link
                href={href({ q: "" })}
                aria-label="Clear search"
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded"
              >
                <XIcon className="size-4" />
              </Link>
            ) : null}
          </form>
        </div>

        {rows.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle>{query ? "No matches" : "Nothing here yet"}</EmptyTitle>
              <EmptyDescription>
                {query
                  ? `Nothing ${viewKey === "all" ? "" : `in “${view.label}” `}matches “${query}”. Try part of a phone number or a surname.`
                  : viewKey === "all"
                    ? "Buyers appear here as soon as the first order comes through."
                    : `No orders are “${view.label}” right now.`}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {/* Column labels, only where there are columns. */}
            <div className="text-muted-foreground hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_7rem_8rem_7.5rem_6rem_1rem] gap-4 border-b px-4 py-2.5 text-xs font-medium md:grid">
              <span>Buyer</span>
              <span>Phone</span>
              <span>Tickets</span>
              <span className="text-right">Amount</span>
              <span>Status</span>
              <span className="text-right">When</span>
              <span />
            </div>

            <ul className="divide-y">
              {rows.map((order) => {
                const tickets = Array.isArray(order.tickets) ? order.tickets : [];
                const live = tickets.filter((t) => t.status !== "void");
                const checkedIn = tickets.filter((t) => t.status === "checked_in").length;
                const status = STATUS_STYLE[order.status] ?? {
                  label: order.status,
                  className: "bg-muted text-muted-foreground",
                };
                const amount = formatPesewas(order.total_pesewas, toCurrency(order.currency));

                return (
                  <li key={order.id}>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="hover:bg-muted/50 focus-visible:bg-muted/50 group flex items-center gap-3 px-4 py-3 transition-colors outline-none md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_7rem_8rem_7.5rem_6rem_1rem] md:gap-4"
                    >
                      {/* Buyer */}
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar className="hidden sm:flex">
                          <AvatarFallback className="text-xs font-medium">
                            {initials(order.buyer_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{order.buyer_name}</p>
                          <p className="text-muted-foreground truncate text-xs">
                            {order.buyer_email}
                          </p>
                          {/* On a phone the columns fold into this line. */}
                          <p className="text-muted-foreground mt-0.5 truncate text-xs md:hidden">
                            {order.buyer_phone}
                            {tickets.length ? `, ${tickets.length} ticket${tickets.length === 1 ? "" : "s"}` : ""}
                            {checkedIn ? `, ${checkedIn === live.length ? "all" : checkedIn} in` : ""}
                          </p>
                        </div>
                      </div>

                      <span className="text-muted-foreground hidden truncate text-sm tabular-nums md:block">
                        {order.buyer_phone}
                      </span>

                      <span className="hidden text-sm tabular-nums md:block">
                        {tickets.length === 0 ? (
                          <span className="text-muted-foreground">None</span>
                        ) : (
                          <>
                            {tickets.length}
                            {checkedIn > 0 ? (
                              <span className="text-muted-foreground">
                                {" "}
                                ({checkedIn === live.length ? "all" : checkedIn} in)
                              </span>
                            ) : null}
                          </>
                        )}
                      </span>

                      <div className="flex shrink-0 flex-col items-end gap-1 md:contents">
                        <span className="text-sm font-medium tabular-nums md:text-right">
                          {amount}
                        </span>
                        <span className="md:flex md:items-center">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                              status.className,
                            )}
                          >
                            {status.label}
                          </span>
                        </span>
                      </div>

                      <time
                        dateTime={order.created_at}
                        title={formatTimestamp(order.created_at, tz)}
                        className="text-muted-foreground hidden text-right text-xs md:block"
                      >
                        {formatRelativeTime(order.created_at, tz)}
                      </time>

                      <ChevronRightIcon className="text-muted-foreground/60 group-hover:text-foreground hidden size-4 md:block" />
                    </Link>
                  </li>
                );
              })}
            </ul>

            {rows.length === 200 ? (
              <p className="text-muted-foreground border-t px-4 py-3 text-xs">
                Showing the latest 200. Search to find anyone older, or export the CSV for
                the full list.
              </p>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}

/** "Jennifer Jacks" → "JJ", "Dzifa" → "DZ". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
