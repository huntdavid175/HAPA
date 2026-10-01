import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublishedEvent } from "@/lib/events";
import { getRegistrationDay } from "@/lib/registration-days";
import { RegisterView } from "../_components/register-view";

/**
 * One night's link — its QR code is on the door that night. The same page as
 * `/register`, with this night's form already open in its modal, so a guest who scanned
 * it goes straight to their details. Closing it shows the other nights.
 *
 * Next 16: `params` is a Promise and must be awaited.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/register/[day]">): Promise<Metadata> {
  const day = getRegistrationDay((await params).day);
  if (!day) return { title: "Registration" };
  return {
    title: `Register for ${day.name}`,
    description: `Day ${day.number} registration for ${day.name}.`,
  };
}

export default async function RegisterDayPage({ params }: PageProps<"/register/[day]">) {
  const day = getRegistrationDay((await params).day);
  if (!day) notFound();

  const event = await getPublishedEvent();
  return <RegisterView event={event} initialDay={day} />;
}
