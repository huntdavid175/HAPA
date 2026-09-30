import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardListIcon, DownloadIcon, ExternalLinkIcon, SearchIcon, XIcon } from "lucide-react";
import { cn } from "cn";

import { createClient } from "@/lib/supabase/server";
import { formatRelativeTime, formatTimestamp } from "@/lib/format";
import { formatGhanaPhone } from "@/lib/phone";
import { registrationUrl } from "@/lib/share";
import { HEARD_ABOUT_OPTIONS, REGISTRATION_DAYS } from "@/lib/registration-days";
import {
  parseDayFilter,
  registrationSearchFilter,
  type DayFilter,
} from "@/lib/admin/registrations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Registrations" };
export const dynamic = "force-dynamic";

const LIMIT = 200;

const TABS: { key: DayFilter; label: string }[] = [
  { key: "all", label: "All nights" },
  ...REGISTRATION_DAYS.map((d) => ({ key: d.number, label: `Day ${d.number}` })),
];

/**
 * Guests who filled in the door form, one tab per night.
 *
 * Rows are not links: a registration has nothing more to it than what the row shows. The
 * side column answers the organiser's other question, how people heard about the event,
 * for the night that is selected.
 */
export default async function RegistrationsPage({
  searchParams,
}: PageProps<"/admin/registrations">) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const day = parseDayFilter(params.day);
  const search = registrationSearchFilter(query);

  const supabase = await createClient();

  let listRequest = supabase
    .from("registrations")
    .select(
      "id, day, first_name, last_name, email, phone, occupation, heard_about, heard_about_other, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (day !== "all") listRequest = listRequest.eq("day", day);
  if (search) listRequest = listRequest.or(search);

  // One narrow read feeds the tab counts and the breakdown. Not searched: "how did people
  // hear" is a question about the night, not about whoever matched a search.
  const summaryRequest = supabase.from("registrations").select("day, heard_about").limit(20000);

  const [{ data: registrations, error }, { data: summary }, { data: event }] = await Promise.all([
    listRequest,
    summaryRequest,
    supabase
      .from("events")
      .select("timezone")
      .not("status", "eq", "archived")
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (error) throw error;

  const rows = registrations ?? [];
  const all = summary ?? [];
  const tz = event?.timezone ?? "Africa/Accra";

  const countFor = (key: DayFilter) =>
    key === "all" ? all.length : all.filter((r) => r.day === key).length;

  const inView = day === "all" ? all : all.filter((r) => r.day === day);
  const heard = HEARD_ABOUT_OPTIONS.map((option) => ({
    option,
    count: inView.filter((r) => r.heard_about === option).length,
  }))
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count);
  const heardMax = heard[0]?.count ?? 0;

  const href = (next: { q?: string; day?: DayFilter }) => {
    const sp = new URLSearchParams();
    const q = next.q ?? query;
    const d = next.day ?? day;
    if (d !== "all") sp.set("day", String(d));
    if (q) sp.set("q", q);
    const s = sp.toString();
    return `/admin/registrations${s ? `?${s}` : ""}`;
  };

  const exportHref = href({}).replace("/admin/registrations", "/admin/registrations/export");
  const dayName = day === "all" ? null : REGISTRATION_DAYS.find((d) => d.number === day)!.name;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Registrations</h1>
          <p className="text-muted-foreground text-sm">
            Guests who filled in the form at the door.
          </p>
        </div>

        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={exportHref} prefetch={false} />}
        >
          <DownloadIcon data-icon="inline-start" />
          Export CSV
        </Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="gap-0 py-0">
          <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
            <nav aria-label="Filter by night" className="flex flex-wrap gap-1 sm:shrink-0">
              {TABS.map((tab) => {
                const active = tab.key === day;
                return (
                  <Link
                    key={tab.key}
                    href={href({ day: tab.key })}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    {tab.label}
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {countFor(tab.key)}
                    </span>
                  </Link>
                );
              })}
            </nav>

            <form role="search" className="relative w-full min-w-0 sm:max-w-64 sm:flex-1">
              <label htmlFor="q" className="sr-only">
                Search by name, email, phone or occupation
              </label>
              {day !== "all" ? <input type="hidden" name="day" value={day} /> : null}
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                id="q"
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Search guests"
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
                  <ClipboardListIcon />
                </EmptyMedia>
                <EmptyTitle>{query ? "No matches" : "No one yet"}</EmptyTitle>
                <EmptyDescription>
                  {query
                    ? `No one ${dayName ? `on ${dayName} ` : ""}matches “${query}”. Try a surname or part of a phone number.`
                    : dayName
                      ? `Guests appear here as they register for ${dayName}.`
                      : "Guests appear here as they fill in the form at the door."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="text-muted-foreground hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_5.5rem] gap-4 border-b px-4 py-2.5 text-xs font-medium md:grid">
                <span>Guest</span>
                <span>Occupation</span>
                <span>Heard from</span>
                <span className="text-right">When</span>
              </div>

              <ul className="divide-y">
                {rows.map((r) => {
                  const phone = formatGhanaPhone(r.phone);
                  const heardFrom =
                    r.heard_about === "Other" && r.heard_about_other
                      ? `Other: ${r.heard_about_other}`
                      : r.heard_about;

                  return (
                    <li
                      key={r.id}
                      className="flex flex-col gap-1 px-4 py-3 md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_5.5rem] md:items-center md:gap-4"
                    >
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            <span className="truncate">
                              {r.first_name} {r.last_name}
                            </span>
                            {day === "all" ? (
                              <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-xs font-medium">
                                Day {r.day}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-muted-foreground truncate text-xs">{r.email}</p>
                          <p className="text-muted-foreground text-xs tabular-nums">{phone}</p>
                        </div>
                        {/* On a phone the time rides at the right of the name. */}
                        <time
                          dateTime={r.created_at}
                          title={formatTimestamp(r.created_at, tz)}
                          className="text-muted-foreground shrink-0 text-xs md:hidden"
                        >
                          {formatRelativeTime(r.created_at, tz)}
                        </time>
                      </div>

                      <p className="text-sm break-words md:truncate">
                        <span className="text-muted-foreground md:hidden">Works as </span>
                        {r.occupation}
                      </p>

                      <p className="text-muted-foreground text-sm break-words md:truncate" title={heardFrom}>
                        <span className="md:hidden">Heard from </span>
                        {heardFrom}
                      </p>

                      <time
                        dateTime={r.created_at}
                        title={formatTimestamp(r.created_at, tz)}
                        className="text-muted-foreground hidden text-right text-xs md:block"
                      >
                        {formatRelativeTime(r.created_at, tz)}
                      </time>
                    </li>
                  );
                })}
              </ul>

              {rows.length === LIMIT ? (
                <p className="text-muted-foreground border-t px-4 py-3 text-xs">
                  Showing the latest {LIMIT}. Search to find anyone older, or export the CSV
                  for the full list.
                </p>
              ) : null}
            </>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>How they heard</CardTitle>
              <CardDescription>
                {dayName ? `Guests at ${dayName}.` : "Guests across all three nights."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {heard.length === 0 ? (
                <p className="text-muted-foreground text-sm">No answers yet.</p>
              ) : (
                // A ranked list with the count printed on every row: the bar is only a
                // quick read of size, never the only place a number lives.
                <ul className="flex flex-col gap-3">
                  {heard.map((h) => (
                    <li key={h.option} title={`${h.option}: ${h.count} of ${inView.length}`}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span>{h.option}</span>
                        <span className="font-medium tabular-nums">
                          {h.count}
                          <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                            {Math.round((h.count / inView.length) * 100)}%
                          </span>
                        </span>
                      </div>
                      <div className="bg-muted mt-1.5 h-2 overflow-hidden rounded-full" aria-hidden>
                        <div
                          className="bg-primary h-full rounded-full"
                          style={{ width: `${(h.count / heardMax) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Forms</CardTitle>
              <CardDescription>
                The page each night&rsquo;s door QR code should open.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3">
                {REGISTRATION_DAYS.map((d) => {
                  const url = registrationUrl(d.slug);
                  return (
                    <li key={d.slug} className="min-w-0">
                      <p className="text-sm font-medium">
                        Day {d.number}, {d.name}
                      </p>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener"
                        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs break-all underline-offset-2 hover:underline"
                      >
                        {url}
                        <ExternalLinkIcon className="size-3 shrink-0" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
