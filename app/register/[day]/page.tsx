import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { REGISTRATION_DAYS, getRegistrationDay } from "@/lib/registration-days";
import { RegistrationPass } from "../_components/registration-pass";

/**
 * One night's door registration. Guests reach it from a QR code at the entrance, on
 * their own phone, so it is built for a narrow screen first.
 *
 * Next 16: `params` is a Promise and must be awaited.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return REGISTRATION_DAYS.map((day) => ({ day: day.slug }));
}

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

  return (
    <main className="px-4 pt-8 pb-12 sm:pt-14">
      <div className="mx-auto w-full max-w-sm min-[400px]:max-w-md">
        <RegistrationPass day={day} />
      </div>
    </main>
  );
}
