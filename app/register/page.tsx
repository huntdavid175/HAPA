import type { Metadata } from "next";
import Link from "next/link";

import { REGISTRATION_DAYS } from "@/lib/registration-days";

export const metadata: Metadata = {
  title: "Registration",
  description: "Register for the night you are at.",
};

/**
 * Where a guest lands if they scanned the wrong night's code, or a general one. Each
 * night is a paper stub with its tab in the colour its form carries.
 */
export default function RegisterPage() {
  return (
    <main className="px-4 pt-10 pb-12 sm:pt-16">
      <div className="mx-auto w-full max-w-sm min-[400px]:max-w-md">
        <h1 className="text-[2.25rem] leading-[0.95] font-extrabold tracking-[-0.03em] [font-stretch:110%]">
          Registration
        </h1>
        <p className="mt-3 text-foreground/85">Pick the night you are here for.</p>

        <ul className="mt-8 flex flex-col gap-4">
          {REGISTRATION_DAYS.map((day) => (
            <li key={day.slug} className={day.accentClass}>
              <Link
                href={`/register/${day.slug}`}
                className="theme-paper flex overflow-hidden rounded-[1.25rem] bg-card text-card-foreground transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-[var(--day)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--page)] focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1 px-5 py-5">
                  {day.subtitle ? (
                    <span className="mb-1 block text-sm font-semibold text-muted-foreground">
                      {day.subtitle}
                    </span>
                  ) : null}
                  <span className="block text-[1.375rem] leading-tight font-extrabold tracking-[-0.02em] [font-stretch:105%]">
                    {day.name}
                  </span>
                </span>
                <span
                  className="flex w-10 shrink-0 items-center justify-center"
                  style={{ background: "var(--day)", color: "var(--day-foreground)" }}
                >
                  <span className="rotate-180 text-sm font-extrabold whitespace-nowrap [writing-mode:vertical-rl]">
                    Day {day.number}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
