"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Ticket = { code: string; token: string };

/**
 * The screen a buyer watches while mobile money confirms.
 *
 * Ghanaian mobile money routinely takes 60-120 seconds: the PIN prompt arrives on the
 * phone, the buyer types it, and only then does the charge settle. So this polls rather
 * than deciding once, and it never shows a "try again" button while a payment is still
 * in flight — that is how people end up paying twice.
 *
 * Pinned dark like the event page the buyer just came from; arriving back from Paystack
 * into a differently-coloured site reads as having landed somewhere wrong.
 */
export function OrderStatus({
  reference,
  eventName,
  buyerName,
  buyerPhone,
  buyerEmail,
  amount,
  needsRefund,
  tickets,
}: {
  reference: string;
  eventName: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
  amount: string;
  needsRefund: boolean;
  tickets: Ticket[];
}) {
  const router = useRouter();
  const paid = tickets.length > 0;
  const [waited, setWaited] = useState(0);

  useEffect(() => {
    if (paid) return;
    const tick = setInterval(() => setWaited((s) => s + 5), 5000);
    // Re-render the server component, which re-verifies with Paystack.
    const poll = setInterval(() => router.refresh(), 5000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [paid, router]);

  if (paid) {
    return (
      <main className="theme-night min-h-dvh bg-background text-foreground">
        <div className="mx-auto w-full max-w-md px-6 py-10">
          <div className="flex size-14 items-center justify-center rounded-full bg-cta text-cta-foreground">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-7"
              aria-hidden
            >
              <path d="m5 13 4 4L19 7" />
            </svg>
          </div>

          <h1 className="mt-6 text-3xl leading-tight font-extrabold tracking-[-0.02em]">
            You&rsquo;re in
          </h1>
          <p className="mt-2 text-muted-foreground">
            {tickets.length} ticket{tickets.length === 1 ? "" : "s"} for {eventName}.
          </p>

          {needsRefund ? (
            <p className="mt-6 border-l-2 border-warning pl-4 text-sm">
              <strong className="text-warning">Something needs sorting.</strong> Part of
              your order could not be issued because it sold out while your payment was
              confirming. The organiser has been notified and will be in touch about a
              refund for the difference.
            </p>
          ) : null}

          <p className="mt-6 border-l-2 border-border pl-4 text-sm text-muted-foreground">
            We&rsquo;ve sent your {tickets.length === 1 ? "ticket" : "tickets"} to{" "}
            <strong className="text-foreground break-all">{buyerEmail}</strong>.
            You can also open {tickets.length === 1 ? "it" : "them"} here right now — no
            need to wait.
          </p>

          <ul className="mt-8 space-y-7">
            {tickets.map((ticket, index) => (
              <li key={ticket.token}>
                <Link
                  href={`/t/${ticket.token}`}
                  className="stub grid grid-cols-[minmax(0,1fr)_var(--stub-width)] rounded-2xl bg-cta text-cta-foreground transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-cta focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
                >
                  <div className="p-5">
                    <p className="text-lg leading-tight font-bold [font-stretch:105%]">
                      Ticket {index + 1}
                      {tickets.length > 1 ? ` of ${tickets.length}` : ""}
                    </p>
                    {/* Not `--muted-foreground`: that is a dim mauve tuned for the dark
                        page, and it disappears on the ochre. */}
                    <p className="mt-1.5 text-sm text-cta-foreground/80">Tap to open the QR</p>
                  </div>

                  <div className="flex flex-col items-center justify-center border-l-2 border-dashed border-cta-foreground/30 p-3 text-center">
                    <p className="font-mono text-sm font-bold">{ticket.code}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Save these links. Anyone holding one can use it.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="theme-night min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-md px-6 py-12">
        <div
          className="size-8 animate-spin rounded-full border-2 border-border border-t-cta motion-reduce:animate-none"
          aria-hidden
        />

        <h1 className="mt-6 text-2xl font-bold tracking-[-0.01em]">
          Confirming your payment…
        </h1>

        <p className="mt-3 text-sm text-muted-foreground">
          If you paid by mobile money, check{" "}
          <strong className="text-foreground">{buyerPhone}</strong> for a PIN prompt and
          approve it. This usually takes under two minutes.
        </p>

        <dl className="mt-8 divide-y divide-border border-y border-border">
          <Row label="Event" value={eventName} />
          <Row label="Name" value={buyerName} />
          <Row label="Amount" value={amount} />
          <Row label="Reference" value={reference} mono />
        </dl>

        <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
          {waited < 120
            ? "Waiting for your payment to confirm. Keep this page open."
            : "This is taking longer than usual. Keep this page open — if the money has left your account, your ticket will still arrive by email."}
        </p>

        {/* Deliberately no retry button: a second attempt while the first is still in
            flight is the most common way buyers end up paying twice. */}
        <p className="mt-8 border-l-2 border-border pl-4 text-xs text-muted-foreground">
          Please don&rsquo;t pay again. If you were charged, your ticket is on its way even
          if you close this page. Quote reference{" "}
          <span className="font-mono text-foreground">{reference}</span> if you need to
          contact the organiser.
        </p>
      </div>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd
        className={`text-right ${mono ? "font-mono text-xs break-all" : "text-sm font-semibold"}`}
      >
        {value}
      </dd>
    </div>
  );
}
