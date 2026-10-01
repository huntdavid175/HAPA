import type { Metadata } from "next";

import { getPublishedEvent } from "@/lib/events";
import { RegisterView } from "./_components/register-view";

/**
 * Door registration: the event, then a button per night that opens its form in a modal.
 * Each night also has its own link that opens with its form showing (`[day]/page.tsx`).
 */

// The hero and details are the published event, which the organiser can edit any time.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const event = await getPublishedEvent();
  return {
    title: event ? `Register · ${event.name}` : "Registration",
    description: "Register for the night you are coming to.",
  };
}

export default async function RegisterPage() {
  const event = await getPublishedEvent();
  return <RegisterView event={event} initialDay={null} />;
}
