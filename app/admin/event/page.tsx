import type { Metadata } from "next";

import { ExternalLinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { ensureRichText } from "@/lib/rich-text";
import { utcIsoToLocalInput } from "@/lib/datetime";
import { eventUrl } from "@/lib/share";
import { EventForm, StatusForm, type EventFormValues } from "./forms";
import { TierList } from "./tier-list";

export const metadata: Metadata = { title: "Event" };
export const dynamic = "force-dynamic";

export default async function EventAdminPage() {
  const supabase = await createClient();

  // Admins see every event via RLS; work on the most relevant one.
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .not("status", "eq", "archived")
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const defaults: EventFormValues = event
    ? {
        id: event.id,
        name: event.name,
        slug: event.slug,
        description: ensureRichText(event.description),
        venue: event.venue,
        coverImage: event.cover_image ?? "",
        startsAtLocal: utcIsoToLocalInput(event.starts_at, event.timezone),
        endsAtLocal: event.ends_at
          ? utcIsoToLocalInput(event.ends_at, event.timezone)
          : "",
        timezone: event.timezone,
      }
    : {
        name: "",
        slug: "",
        description: "",
        venue: "",
        coverImage: "",
        startsAtLocal: "",
        endsAtLocal: "",
        timezone: "Africa/Accra",
      };

  const { data: tiers } = event
    ? await supabase
        .from("ticket_tiers")
        .select("*")
        .eq("event_id", event.id)
        .eq("active", true)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true })
    : { data: [] };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {event ? event.name : "Create your event"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {event
              ? "What buyers see, when it runs, and what they can buy."
              : "Start with the name and date. Tiers come once the event exists."}
          </p>
        </div>

        {event ? (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={`/e/${event.slug}`} target="_blank" rel="noreferrer" />}
          >
            <ExternalLinkIcon data-icon="inline-start" />
            View event page
          </Button>
        ) : null}
      </div>

      <EventForm
        event={defaults}
        linkPrefix={eventUrl("")}
        statusCard={
          event ? <StatusCard id={event.id} status={event.status} /> : undefined
        }
        tiersCard={
          event ? (
            <Card>
              <CardHeader>
                <CardTitle>Ticket tiers</CardTitle>
                <CardDescription>
                  Each tier has its own price and capacity, and sells out on its own. Drag
                  to set the order buyers see them in.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TierList eventId={event.id} tiers={tiers ?? []} />
              </CardContent>
            </Card>
          ) : undefined
        }
      />
    </>
  );
}

/** What each status means for a buyer, since the raw word does not say. */
const STATUS: Record<string, { label: string; tone: "live" | "paused" | "off"; means: string }> = {
  published: {
    label: "Live",
    tone: "live",
    means: "Anyone with the link can see the event page and buy tickets.",
  },
  sales_closed: {
    label: "Sales closed",
    tone: "paused",
    means: "The page is up and tickets already sold still work, but nobody can buy more.",
  },
  draft: {
    label: "Draft",
    tone: "off",
    means: "Only admins can see this event. Publish it to put the page live.",
  },
};

function StatusCard({ id, status }: { id: string; status: string }) {
  const info = STATUS[status] ?? { label: status, tone: "off" as const, means: "" };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          {/* A lit dot for live, so the one state that takes money reads at a glance. */}
          <span
            aria-hidden
            className={
              info.tone === "live"
                ? "bg-success ring-success/25 mt-1.5 size-2.5 shrink-0 rounded-full ring-4"
                : info.tone === "paused"
                  ? "bg-warning mt-1.5 size-2.5 shrink-0 rounded-full"
                  : "bg-muted-foreground/50 mt-1.5 size-2.5 shrink-0 rounded-full"
            }
          />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{info.label}</p>
            <p className="text-muted-foreground text-sm">{info.means}</p>
          </div>
        </div>
        <StatusForm id={id} status={status} />
      </CardContent>
    </Card>
  );
}
