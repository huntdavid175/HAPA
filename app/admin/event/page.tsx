import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/server";
import { formatPesewas } from "@/lib/format";
import { utcIsoToLocalInput } from "@/lib/datetime";
import {
  EventForm,
  StatusForm,
  TierForm,
  DeactivateTierButton,
  type EventFormValues,
} from "./forms";

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
        description: event.description,
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
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-6">
            {(tiers ?? []).map((tier, i) => (
              <div key={tier.id} className="flex flex-col gap-4">
                {i > 0 ? <Separator /> : null}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium">
                    {tier.name}{" "}
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {formatPesewas(tier.price_pesewas)} · {tier.capacity} available
                    </span>
                  </p>
                  <DeactivateTierButton id={tier.id} />
                </div>
                <TierForm
                  eventId={event.id}
                  tier={{
                    id: tier.id,
                    name: tier.name,
                    description: tier.description,
                    priceGhs: (tier.price_pesewas / 100).toFixed(2),
                    capacity: String(tier.capacity),
                  }}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {event ? (
        <Card>
          <CardHeader>
            <CardTitle>Add a tier</CardTitle>
            <CardDescription>
              A new price point. Existing sales are untouched.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TierForm eventId={event.id} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
