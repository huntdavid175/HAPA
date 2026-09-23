import type { Metadata } from "next";

import { richTextToPlain, truncatePlain } from "@/lib/rich-text";
import { notFound } from "next/navigation";

import { getEventBySlug } from "@/lib/events";
import { EventView } from "@/app/_components/event-view";

/**
 * Stable per-event URL. The root shows whatever is currently published; this one keeps
 * working for a specific event, which matters because a printed QR code cannot be
 * reprinted once the posters are out.
 *
 * Next 16: `params` is a Promise and must be awaited.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: PageProps<"/e/[slug]">,
): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) return { title: "Event not found" };
  return {
    title: event.name,
    description:
      truncatePlain(richTextToPlain(event.description)) ||
      `Tickets for ${event.name}`,
  };
}

export default async function EventPage({ params }: PageProps<"/e/[slug]">) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);

  // A draft event is not merely hidden from this query — RLS never returns it to anon, so
  // an unpublished slug is genuinely a 404 to the public.
  if (!event) notFound();

  return <EventView event={event} />;
}
