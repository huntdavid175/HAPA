import { formatEventDate, formatEventTime } from "@/lib/format";
import { isFullyUnavailable, type EventWithTiers } from "@/lib/events";
import { TierCard } from "./tier-card";

/**
 * The buyer's first screen — usually reached by scanning a QR at a poster or tapping a
 * link in WhatsApp. Everything above the fold answers "what, when, where, how much".
 */
export function EventView({ event }: { event: EventWithTiers }) {
  const soldOut = isFullyUnavailable(event);
  const salesClosed = event.status === "sales_closed";

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <header>
        <h1 className="text-2xl leading-tight font-bold sm:text-4xl">{event.name}</h1>

        <dl className="mt-4 space-y-1.5 text-sm sm:text-base">
          <div className="flex gap-2">
            <dt className="sr-only">Date</dt>
            <dd className="text-muted">
              {formatEventDate(event.starts_at, event.timezone)} ·{" "}
              {formatEventTime(event.starts_at, event.timezone)}
            </dd>
          </div>
          {event.venue ? (
            <div className="flex gap-2">
              <dt className="sr-only">Venue</dt>
              <dd className="text-muted">{event.venue}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      {event.description ? (
        <p className="mt-6 text-sm leading-relaxed sm:text-base">{event.description}</p>
      ) : null}

      <section className="mt-8" aria-labelledby="tickets-heading">
        <h2 id="tickets-heading" className="text-lg font-semibold sm:text-xl">
          Tickets
        </h2>

        {salesClosed ? (
          <Notice>
            Ticket sales for this event have closed. If you already bought a ticket, it is
            still valid — check your WhatsApp or SMS.
          </Notice>
        ) : soldOut ? (
          <Notice>
            Every ticket has been sold. If more are released they will appear here.
          </Notice>
        ) : null}

        {event.tiers.length === 0 ? (
          <Notice>No ticket types have been set up for this event yet.</Notice>
        ) : (
          <ul className="mt-4 space-y-3">
            {event.tiers.map((tier) => (
              <TierCard key={tier.id} tier={tier} />
            ))}
          </ul>
        )}
      </section>

      {/*
        Checkout is deliberately absent: payments are deferred until Paystack Ghana
        verification completes. Saying so plainly beats a button that fails.
      */}
      {!soldOut && !salesClosed && event.tiers.length > 0 ? (
        <section className="mt-8 rounded-xl border border-dashed border-border p-4 sm:p-5">
          <h2 className="text-base font-semibold">Buying isn&rsquo;t open yet</h2>
          <p className="mt-1 text-sm text-muted">
            Online payment is being set up. Once it&rsquo;s live you&rsquo;ll pick your
            tickets here, pay with mobile money or card, and get them on WhatsApp and SMS
            straight away.
          </p>
        </section>
      ) : null}
    </main>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-xl border border-border bg-card p-4 text-sm text-muted">
      {children}
    </p>
  );
}
