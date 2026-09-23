import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { getTicketByToken } from "@/lib/tickets";
import { qrSvg } from "@/lib/share";
import { formatEventDate, formatEventTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Your ticket",
  // Tickets are private to whoever holds the link.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The buyer's ticket. Reached from the link sent over WhatsApp/SMS — no sign-in.
 *
 * Designed for a phone held up at a gate in the dark: the QR is the largest thing on the
 * page, and the short code sits right under it in case the scanner will not cooperate.
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
  const position = ticket.siblingTokens.indexOf(ticket.qrToken) + 1;

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <header className="text-center">
        <h1 className="text-xl font-bold">{ticket.eventName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatEventDate(ticket.eventStartsAt, ticket.eventTimezone)} ·{" "}
          {formatEventTime(ticket.eventStartsAt, ticket.eventTimezone)}
        </p>
        {ticket.eventVenue ? (
          <p className="text-sm text-muted-foreground">{ticket.eventVenue}</p>
        ) : null}
      </header>

      {voided ? (
        <p className="mt-5 rounded-xl border border-destructive/50 bg-card p-4 text-center text-sm">
          <strong className="text-destructive">This ticket has been cancelled.</strong> It will
          not be accepted at the door. Contact the organizer if you think that is wrong.
        </p>
      ) : used ? (
        <p className="mt-5 rounded-xl border border-warning/50 bg-card p-4 text-center text-sm">
          <strong className="text-warning">Already checked in</strong>
          {ticket.checkedInAt
            ? ` at ${formatEventTime(ticket.checkedInAt, ticket.eventTimezone)}`
            : ""}
          .
        </p>
      ) : null}

      <section
        className={`mt-5 rounded-2xl bg-white p-5 ${voided ? "opacity-40" : ""}`}
        aria-label="Ticket QR code"
      >
        <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-4 text-center font-mono text-2xl font-bold tracking-wider text-black">
          {ticket.code}
        </p>
        <p className="mt-1 text-center text-xs text-neutral-500">
          Show this code if the scanner does not work
        </p>
      </section>

      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="font-medium">{ticket.buyerName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Ticket type</dt>
          <dd className="font-medium">{ticket.tierName}</dd>
        </div>
        {ticket.siblingTokens.length > 1 ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Ticket</dt>
            <dd className="font-medium">
              {position} of {ticket.siblingTokens.length}
            </dd>
          </div>
        ) : null}
      </dl>

      {ticket.siblingTokens.length > 1 ? (
        <section className="mt-6">
          <h2 className="text-sm font-medium">Other tickets on this order</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Each one admits a single person. Send the others to whoever is coming with you —
            they can arrive separately.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {ticket.siblingTokens.map((sibling, index) => (
              <li key={sibling}>
                <Link
                  href={`/t/${sibling}`}
                  aria-current={sibling === ticket.qrToken ? "page" : undefined}
                  className={`inline-block rounded-lg border px-3 py-2 text-sm ${
                    sibling === ticket.qrToken
                      ? "border-destructive font-semibold"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {index + 1}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Keep this link. It is your ticket — anyone with it can use it.
      </p>
    </main>
  );
}
