import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
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
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {event ? "Event settings" : "Create your event"}
          </h1>
          <p className="text-muted-foreground text-sm">
            What buyers see, when it runs, and what they can buy.
          </p>
        </div>

        {event ? (
          <div className="flex items-center gap-3">
            <Badge variant={event.status === "published" ? "default" : "secondary"}>
              {event.status}
            </Badge>
            <StatusForm id={event.id} status={event.status} />
          </div>
        ) : null}
      </div>

      <Card>
        <CardContent>
          <EventForm event={defaults} />
        </CardContent>
      </Card>

      {event ? (
        <Card>
          <CardHeader>
            <CardTitle>Ticket tiers</CardTitle>
            <CardDescription>
              Each tier has its own price and capacity, and sells out independently.
              Drag to set the order buyers see them in.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <TierList eventId={event.id} tiers={tiers ?? []} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
