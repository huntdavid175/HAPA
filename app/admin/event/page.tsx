import type { Metadata } from "next";

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
        startsAtLocal: utcIsoToLocalInput(event.starts_at, event.timezone),
        timezone: event.timezone,
      }
    : {
        name: "",
        slug: "",
        description: "",
        venue: "",
        startsAtLocal: "",
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
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-xl font-bold sm:text-2xl">
        {event ? "Event settings" : "Create your event"}
      </h1>

      {event ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm">
            Status: <span className="font-semibold">{event.status}</span>
          </p>
          <StatusForm id={event.id} status={event.status} />
        </div>
      ) : null}

      <section className="mt-8">
        <EventForm event={defaults} />
      </section>

      {event ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Ticket tiers</h2>
          <p className="mt-1 text-sm text-muted">
            Each tier has its own price and capacity, and sells out independently.
          </p>

          <ul className="mt-4 space-y-4">
            {(tiers ?? []).map((tier) => (
              <li key={tier.id} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">
                    {tier.name}{" "}
                    <span className="text-sm text-muted">
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
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-xl border border-dashed border-border p-4">
            <h3 className="mb-3 font-medium">Add a tier</h3>
            <TierForm eventId={event.id} />
          </div>
        </section>
      ) : null}
    </main>
  );
}
