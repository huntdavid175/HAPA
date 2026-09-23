import type { Metadata } from "next";

import { getPublishedEvent } from "@/lib/events";
import { EventView } from "./_components/event-view";

/**
 * The site root IS the event. There is no listing page — buyers arrive from a QR code or
 * a shared link, and exactly one event is published at a time (enforced by a unique index
 * in the database, not by convention).
 */

// Availability changes as people buy, so this must not be cached at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const event = await getPublishedEvent();
  if (!event) return { title: "Tickets" };
  return {
    title: event.name,
    description: event.description || `Tickets for ${event.name}`,
  };
}

export default async function HomePage() {
  const event = await getPublishedEvent();

  if (!event) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col items-start px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-bold sm:text-3xl">No event on sale</h1>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          There is no event published right now. If you followed a link or scanned a code,
          the event may have ended or not been published yet.
        </p>
      </main>
    );
  }

  return <EventView event={event} />;
}
