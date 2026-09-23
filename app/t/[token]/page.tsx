import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getTicketByToken } from "@/lib/tickets";
import { qrSvg } from "@/lib/share";
import { formatEventDateRange, formatEventTime } from "@/lib/format";
import { TicketActions } from "@/app/_components/ticket-actions";

export const metadata: Metadata = {
  title: "Your ticket",
  // Tickets are private to whoever holds the link.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The buyer's ticket. Reached from the link sent over WhatsApp/SMS — no sign-in.
 *
 * Shaped like the thing it replaces: a stub carrying the event and the facts, a
 * perforation, then the half that gets scanned. That is not decoration — the tear tells
 * someone holding up a phone where the machine-readable part starts, and door staff
 * recognise the shape from a metre away.
 *
 * Designed for a phone held up at a gate in the dark: the pass stays paper-light whatever
 * the device prefers (see `.theme-paper`), the QR is the largest thing on it, and the
 * short code sits right beside it in case the scanner will not cooperate.
 */
export default async function TicketPage({ params }: PageProps<"/t/[token]">) {
  const { token } = await params;
  const ticket = await getTicketByToken(token);
  if (!ticket) notFound();

  // The QR encodes the token itself, not a URL: the scanner looks the ticket up directly,
  // so check-in works even if the gate's connection cannot load a web page.
  const svg = await qrSvg(ticket.qrToken);

  const voided = ticket.status === "void";
  const used = ticket.status === "checked_in";
  const ofMany = ticket.ticketCount > 1;
  const title = titleClass(ticket.eventName);

  return (
    <main className="theme-night print-sheet min-h-dvh bg-background px-4 py-8 text-foreground">
      {/* The pass itself is plain HTML and needs nothing. Only the buttons under it do,
          so those are hidden rather than left sitting there doing nothing. */}
      <noscript>
        <style>{`.js-only{display:none!important}`}</style>
      </noscript>

      <div className="mx-auto w-full max-w-sm">
        <p className="print-hide mb-5 text-center text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          Your ticket
        </p>

        {voided ? (
          <p className="mb-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-center text-sm">
            <strong className="font-semibold text-destructive">
              This ticket has been cancelled.
            </strong>{" "}
            It will not be accepted at the door. Contact the organizer if you think that is
            wrong.
          </p>
        ) : used ? (
          <p className="mb-4 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-center text-sm">
            <strong className="font-semibold text-warning">Already checked in</strong>
            {ticket.checkedInAt
              ? ` at ${formatEventTime(ticket.checkedInAt, ticket.eventTimezone)}`
              : ""}
            . One scan per ticket — this one has been used.
          </p>
        ) : null}

        <article className={`ticket-pass ${voided ? "opacity-50" : ""}`}>
          {/* ---- The stub: what the event is --------------------------------------- */}
          <div className="theme-paper rounded-t-[1.75rem] bg-card px-5 pt-5 pb-6 text-card-foreground">
            <div className="flex items-start gap-4">
              {/* `cover_image` is a free-text URL an admin pasted, so it could point
                  anywhere. That rules out `next/image`, which refuses a host missing from
                  `remotePatterns` and would turn a typo into a 500 on the one page a buyer
                  needs at the door. */}
              {ticket.eventCoverImage ? (
                /* eslint-disable-next-line @next/next/no-img-element -- see the note above */
                <img
                  src={ticket.eventCoverImage}
                  // Decorative: the event name is the <h1> right beside it.
                  alt=""
                  aria-hidden
                  className="size-24 shrink-0 rounded-2xl bg-muted object-cover"
                />
              ) : null}

              <div className="min-w-0 flex-1 pt-0.5">
                <h1 className={`text-balance break-words ${title.name}`}>{ticket.eventName}</h1>
                {ticket.eventVenue ? (
                  <p className={`mt-1.5 leading-snug font-semibold text-muted-foreground ${title.venue}`}>
                    {ticket.eventVenue}
                  </p>
                ) : null}
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4">
              <Fact label="Date">
                {formatEventDateRange(
                  ticket.eventStartsAt,
                  ticket.eventEndsAt,
                  ticket.eventTimezone,
                )}
              </Fact>

              <Fact label="Doors open">
                {formatEventTime(ticket.eventStartsAt, ticket.eventTimezone)}
              </Fact>

              {/* Only when the organiser actually set an end — inventing one would put a
                  time on a ticket that nobody committed to. */}
              {ticket.eventEndsAt ? (
                <Fact label="Doors close">
                  {formatEventTime(ticket.eventEndsAt, ticket.eventTimezone)}
                </Fact>
              ) : null}

              <Fact label="Admits">
                {ofMany ? `${ticket.position} of ${ticket.ticketCount}` : "1 person"}
              </Fact>

              <div className="col-span-2">
                <Fact label="Email">
                  <span className="break-all">{ticket.buyerEmail}</span>
                </Fact>
              </div>
            </dl>
          </div>

          {/* ---- The tear ---------------------------------------------------------- */}
          {/* No horizontal padding: the perforation has to reach both edges so the
              notches can be punched out of them. */}
          <div className="theme-paper bg-muted">
            <div className="ticket-perf" />
          </div>

          {/* ---- The half that gets scanned ---------------------------------------- */}
          <section
            className="theme-paper flex items-center gap-4 rounded-b-[1.75rem] bg-muted px-5 py-6 text-foreground"
            aria-label="Ticket QR code"
          >
            {/* White under the QR whatever else the pass does: scanners want dark modules
                on a light quiet zone, and the margin is part of the code. */}
            <div className="w-36 shrink-0 rounded-2xl bg-white p-2">
              <div
                className="[&>svg]:h-auto [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[1.375rem] leading-[1.1] font-bold break-words">
                {ticket.buyerName}
              </p>
              <p className="mt-3 text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Code
              </p>
              <p className="font-mono text-xl font-bold tracking-wider">{ticket.code}</p>
              <p className="mt-1 text-xs leading-snug text-muted-foreground">
                Read this out if the scanner does not work
              </p>
            </div>

            {/* The tier printed down the edge, the way a wristband colour is the first
                thing a steward looks for. The organiser's own words — nothing derived.
                Run to the card's edge so it reads as a tab rather than a stray pill. */}
            <span className="-mr-5 flex w-7 shrink-0 items-center justify-center self-stretch rounded-l-lg bg-primary py-3 text-primary-foreground">
              <span className="max-h-44 rotate-180 overflow-hidden text-xs font-bold tracking-wide whitespace-nowrap [writing-mode:vertical-rl]">
                {ticket.tierName}
              </span>
            </span>
          </section>
        </article>

        <TicketActions eventName={ticket.eventName} />

        {/* No link to the rest of the order, deliberately. This page is reached by
            holding the token, and the token is the whole of the authorization — a list
            of the siblings would mean forwarding one ticket to a friend also handed
            them everyone else's. The buyer reaches the full set from the order page
            they were sent, which is a receipt rather than something you pass on. */}

        <p className="print-hide mt-8 text-center text-xs text-muted-foreground">
          {ofMany
            ? "This link is one ticket. Anyone holding it can use it, so send each person their own."
            : "Keep this link. It is your ticket — anyone with it can use it."}
        </p>
      </div>
    </main>
  );
}

/**
 * The title sits in a ~14rem column beside the artwork, so it cannot be one size.
 * "Afrochella" wants to fill it; the ten-word award-show name this project was built
 * around would run to seven lines and push the QR off a phone screen. The venue steps
 * down with it, keeping the pair looking deliberate rather than merely shrunk.
 */
function titleClass(name: string): { name: string; venue: string } {
  const n = name.trim().length;

  if (n <= 24) {
    return {
      name: "text-[1.625rem] leading-[1.05] font-extrabold tracking-[-0.02em] [font-stretch:105%]",
      venue: "text-lg",
    };
  }
  if (n <= 55) {
    return {
      name: "text-xl leading-[1.1] font-extrabold tracking-[-0.015em]",
      venue: "text-base",
    };
  }
  return { name: "text-[1.0625rem] leading-[1.2] font-bold", venue: "text-sm" };
}

/** One labelled fact on the stub. Label above value, so a long value wraps under it. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold">{children}</dd>
    </div>
  );
}
