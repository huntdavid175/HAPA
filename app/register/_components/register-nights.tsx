"use client";

import { useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ArrowRightIcon, CheckIcon, XIcon } from "lucide-react";

import { REGISTRATION_DAYS, type RegistrationDay } from "@/lib/registration-days";
import {
  RegistrationPass,
  registrationTitleId,
  type Registered,
} from "./registration-pass";

/**
 * One button per night; each opens that night's pass in a modal.
 *
 * A night's own link (`/register/day-2`, its QR on the door) arrives with that night's
 * modal already open, so a guest who scanned it goes straight to their details.
 *
 * Who has registered for which night is kept here, not in the pass, so the button can
 * say so and the modal reopens on the stamped pass instead of an empty form.
 */
export function RegisterNights({ initialDay }: { initialDay: RegistrationDay | null }) {
  const [openSlug, setOpenSlug] = useState<string | null>(initialDay?.slug ?? null);
  const [registered, setRegistered] = useState<Record<string, Registered>>({});
  // Remembered through the closing animation, so the pass does not vanish mid-fade.
  const [shownSlug, setShownSlug] = useState<string | null>(initialDay?.slug ?? null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const shown = REGISTRATION_DAYS.find((d) => d.slug === shownSlug) ?? null;

  function open(day: RegistrationDay) {
    setShownSlug(day.slug);
    setOpenSlug(day.slug);
  }

  return (
    <>
      <ul className="flex flex-col gap-4">
        {REGISTRATION_DAYS.map((day) => {
          const done = Boolean(registered[day.slug]);
          return (
            <li key={day.slug} className={day.accentClass}>
              <button
                type="button"
                onClick={() => open(day)}
                className="theme-paper group flex w-full overflow-hidden rounded-[1.25rem] bg-card text-left text-card-foreground transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-[var(--day)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--page)] focus-visible:outline-none"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-4 px-5 py-5">
                  <span>
                    {day.subtitle ? (
                      <span className="mb-0.5 block text-sm font-semibold text-muted-foreground">
                        {day.subtitle}
                      </span>
                    ) : null}
                    {/* "Day 1 – African Showcase": the day first, in its colour, so the
                        three read as a running order. Large and bold, so each colour
                        clears the 3:1 that large text needs on paper white. Two columns,
                        so a long name wraps under itself, never back under the day. */}
                    <span className="flex gap-x-[0.3em] text-[1.375rem] leading-tight font-extrabold tracking-[-0.02em] [font-stretch:105%]">
                      <span className="shrink-0 whitespace-nowrap" style={{ color: "var(--day)" }}>
                        Day {day.number} –
                      </span>
                      <span className="min-w-0">{day.name}</span>
                    </span>
                  </span>

                  {done ? (
                    <span
                      className="inline-flex h-11 w-fit self-center lg:self-start items-center gap-2 rounded-xl border-2 px-4 text-[0.95rem] font-bold"
                      style={{ borderColor: "var(--day)", color: "var(--day)" }}
                    >
                      <CheckIcon className="size-4" strokeWidth={3} />
                      Registered
                    </span>
                  ) : (
                    <span className="inline-flex h-11 w-fit self-center lg:self-start items-center gap-2 rounded-xl bg-foreground px-5 text-[0.95rem] font-bold text-background transition group-hover:opacity-90">
                      Register
                      <ArrowRightIcon className="size-4 transition group-hover:translate-x-0.5" />
                    </span>
                  )}
                </span>

                {/* The night's colour down the edge, as on the pass. */}
                <span
                  aria-hidden
                  className="flex w-10 shrink-0 items-center justify-center"
                  style={{ background: "var(--day)", color: "var(--day-foreground)" }}
                >
                  <span className="rotate-180 text-sm font-extrabold whitespace-nowrap [writing-mode:vertical-rl]">
                    Day {day.number}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <DialogPrimitive.Root
        open={openSlug !== null}
        onOpenChange={(next) => {
          if (!next) setOpenSlug(null);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/70 duration-150 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />

          {/* The popup is the whole screen and scrolls, so a long form on a short phone
              scrolls inside the modal rather than the page behind it. Rendered through a
              portal, so it repeats `theme-night` — outside that subtree it would take the
              admin palette (AGENTS.md). Clicks on the dark space around the pass close it,
              as a click on a backdrop would. */}
          {shown ? (
            <DialogPrimitive.Popup
              aria-labelledby={registrationTitleId(shown)}
              initialFocus={closeRef}
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpenSlug(null);
              }}
              className="theme-night fixed inset-0 z-50 overflow-y-auto overscroll-contain px-4 pt-16 pb-10 text-foreground outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-4 sm:pt-20"
            >
              <div className="relative mx-auto w-full max-w-sm min-[400px]:max-w-md">
                <DialogPrimitive.Close
                  ref={closeRef}
                  aria-label="Close"
                  className="absolute -top-13 right-0 flex size-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                >
                  <XIcon className="size-5" />
                </DialogPrimitive.Close>

                <RegistrationPass
                  key={shown.slug}
                  day={shown}
                  registered={registered[shown.slug] ?? null}
                  onRegistered={(details) =>
                    setRegistered((prev) => ({ ...prev, [shown.slug]: details }))
                  }
                />
              </div>
            </DialogPrimitive.Popup>
          ) : null}
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
