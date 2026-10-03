import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon, InboxIcon, MailIcon, PhoneIcon, RotateCcwIcon } from "lucide-react";
import { cn } from "cn";

import { createClient } from "@/lib/supabase/server";
import { formatRelativeTime, formatTimestamp } from "@/lib/format";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import { formatGhanaPhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { setRequestHandled } from "./actions";

export const metadata: Metadata = { title: "Ticket requests" };
export const dynamic = "force-dynamic";

type Tab = "new" | "handled" | "all";
const TABS: { key: Tab; label: string }[] = [
  { key: "new", label: "New" },
  { key: "handled", label: "Handled" },
  { key: "all", label: "All" },
];

/**
 * Requests for tiers booked through the organiser (the dollar table): who wants what,
 * how to reach them, and what they said. Each arrived as an email too; this is the list
 * to work through, and "Mark handled" is how a request leaves the New tab.
 *
 * A list, not a table: a request is a few lines of contact details plus a message, which
 * a table cell would cut off.
 */
export default async function TicketRequestsPage({
  searchParams,
}: PageProps<"/admin/requests">) {
  const params = await searchParams;
  const tab: Tab = params.tab === "handled" || params.tab === "all" ? params.tab : "new";

  const supabase = await createClient();
  let request = supabase
    .from("ticket_requests")
    .select(
      "id, tier_name, quantity, buyer_name, buyer_email, buyer_phone, organisation, message, heard_about, heard_about_other, status, handled_at, created_at, events(timezone)",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (tab !== "all") request = request.eq("status", tab);

  const [{ data }, { count: newCount }] = await Promise.all([
    request,
    supabase
      .from("ticket_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
  ]);
  const rows = data ?? [];

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ticket requests</h1>
        <p className="text-muted-foreground text-sm">
          Tickets booked through you rather than paid online. Each one is emailed to you as
          well; reply there to reach the requester.
        </p>
      </div>

      <Card className="gap-0 py-0">
        <nav aria-label="Filter requests" className="flex flex-wrap gap-1 border-b p-3">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Link
                key={t.key}
                href={t.key === "new" ? "/admin/requests" : `/admin/requests?tab=${t.key}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {t.label}
                {t.key === "new" && newCount ? (
                  <span className="text-muted-foreground text-xs tabular-nums">{newCount}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {rows.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>{tab === "new" ? "Nothing waiting" : "No requests yet"}</EmptyTitle>
              <EmptyDescription>
                {tab === "new"
                  ? "New requests appear here and in your inbox the moment someone sends one."
                  : "Requests appear here when someone asks to book a ticket that is not sold online."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => {
              const tz = (r.events as unknown as { timezone: string } | null)?.timezone ?? "Africa/Accra";
              const heard =
                r.heard_about === "Other" && r.heard_about_other
                  ? `Other: ${r.heard_about_other}`
                  : r.heard_about;
              const handled = r.status === "handled";

              return (
                <li key={r.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:gap-6">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="text-sm font-semibold">
                        {r.organisation ?? r.buyer_name}
                      </p>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          handled ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                        )}
                      >
                        {handled ? "Handled" : "New"}
                      </span>
                      <time
                        dateTime={r.created_at}
                        title={formatTimestamp(r.created_at, tz)}
                        className="text-muted-foreground text-xs"
                      >
                        {formatRelativeTime(r.created_at, tz)}
                      </time>
                    </div>

                    <p className="text-sm">
                      <span className="font-medium tabular-nums">{r.quantity} ×</span> {r.tier_name}
                      {r.organisation ? (
                        <span className="text-muted-foreground"> · for {r.buyer_name}</span>
                      ) : null}
                    </p>

                    <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <a href={`mailto:${r.buyer_email}`} className="hover:text-foreground inline-flex min-w-0 items-center gap-1.5 break-all">
                        <MailIcon className="size-3.5 shrink-0" />
                        {r.buyer_email}
                      </a>
                      <a href={`tel:${r.buyer_phone}`} className="hover:text-foreground inline-flex items-center gap-1.5 tabular-nums">
                        <PhoneIcon className="size-3.5 shrink-0" />
                        {readablePhone(r.buyer_phone)}
                      </a>
                    </div>

                    {r.message ? (
                      <p className="bg-muted/50 rounded-md px-3 py-2 text-sm whitespace-pre-wrap break-words">
                        {r.message}
                      </p>
                    ) : null}

                    <p className="text-muted-foreground text-xs">Heard about it: {heard}</p>
                  </div>

                  <form action={setRequestHandled} className="shrink-0">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="handled" value={handled ? "false" : "true"} />
                    <Button type="submit" variant={handled ? "ghost" : "outline"} size="sm">
                      {handled ? (
                        <>
                          <RotateCcwIcon data-icon="inline-start" />
                          Reopen
                        </>
                      ) : (
                        <>
                          <CheckIcon data-icon="inline-start" />
                          Mark handled
                        </>
                      )}
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

/** 024 123 4567 for Ghana, +1 212 555 0123 elsewhere — corporate buyers are often abroad. */
function readablePhone(e164: string): string {
  if (e164.startsWith("+233")) return formatGhanaPhone(e164);
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}
