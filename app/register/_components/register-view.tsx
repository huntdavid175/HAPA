import { EventHero } from "@/app/_components/event-hero";
import { AboutText } from "@/app/_components/about-text";
import { EventCrest } from "@/app/_components/event-crest";
import type { EventWithTiers } from "@/lib/events";
import { formatEventDateRange } from "@/lib/format";
import type { RegistrationDay } from "@/lib/registration-days";
import { ensureRichText } from "@/lib/rich-text";
import { RegisterNights } from "./register-nights";

/**
 * The registration page, built like the ticket page: the cover as a hero, a few lines on
 * the event, then a button per night that opens its form in a modal. A guest who scanned
 * a code at the door sees what they are registering for before they are asked anything.
 *
 * Deliberately brief — no tiers, no prices, no buy button. The description is clamped to
 * a few lines so the nights are never far down the page.
 *
 * `event` is null when nothing is published; the form still works, since registration
 * nights are config (lib/registration-days.ts), not event rows.
 */
export function RegisterView({
  event,
  initialDay,
}: {
  event: EventWithTiers | null;
  initialDay: RegistrationDay | null;
}) {
  return (
    <main className="min-h-dvh pb-16">
      {event ? (
        <div className="mx-auto w-full max-w-5xl">
          <EventHero src={event.cover_image} eventName={event.name} showControls={false} />
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-5xl px-4 min-[400px]:px-6 sm:px-8">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-x-14">
          <header className="px-2 pt-7 min-[400px]:px-0 lg:sticky lg:top-10">
            <EventCrest className="mb-5" />
            <p className="text-sm font-semibold text-muted-foreground">Guest registration</p>
            <h1 className="mt-2 text-[1.625rem] leading-[1.1] font-extrabold tracking-[-0.02em] text-balance break-words [font-stretch:105%] sm:text-3xl lg:text-4xl">
              {event?.name ?? "Registration"}
            </h1>

            {event ? (
              <dl className="mt-5 flex flex-col gap-2.5 text-[0.95rem] text-muted-foreground">
                {event.venue ? (
                  <div className="flex items-start gap-2.5">
                    <dt className="sr-only">Venue</dt>
                    <PinIcon />
                    <dd>{event.venue}</dd>
                  </div>
                ) : null}
                <div className="flex items-start gap-2.5">
                  <dt className="sr-only">Date</dt>
                  <CalendarIcon />
                  <dd>{formatEventDateRange(event.starts_at, event.ends_at, event.timezone)}</dd>
                </div>
              </dl>
            ) : null}

            {event?.description ? (
              <div className="mt-6 max-w-[62ch]">
                <AboutText html={ensureRichText(event.description)} clampAfter={3} />
              </div>
            ) : null}
          </header>

          <section aria-labelledby="nights-heading" className="mt-10 lg:mt-8">
            <h2 id="nights-heading" className="mb-4 px-2 text-lg font-bold min-[400px]:px-0">
              Register for a night
            </h2>
            <RegisterNights initialDay={initialDay} />
          </section>
        </div>
      </div>
    </main>
  );
}

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 size-4 shrink-0"
      aria-hidden
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 size-4 shrink-0"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </svg>
  );
}
