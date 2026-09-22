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
 */
export function OrderStatus({
  reference,
  eventName,
  buyerName,
  buyerPhone,
  amount,
  needsRefund,
  tickets,
}: {
  reference: string;
  eventName: string;
  buyerName: string;
  buyerPhone: string;
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
      <main className="mx-auto w-full max-w-md px-4 py-8">
        <h1 className="text-2xl font-bold">You&rsquo;re in</h1>
        <p className="mt-1 text-sm text-muted">
          {tickets.length} ticket{tickets.length === 1 ? "" : "s"} for {eventName}.
        </p>

        {needsRefund ? (
          <p className="mt-4 rounded-xl border border-warning/50 bg-card p-4 text-sm">
            <strong className="text-warning">Something needs sorting.</strong> Part of your
            order could not be issued because it sold out while your payment was
            confirming. The organizer has been notified and will be in touch about a
            refund for the difference.
          </p>
        ) : null}

        <p className="mt-5 rounded-xl border border-border bg-card p-4 text-sm">
          We&rsquo;ve sent your {tickets.length === 1 ? "ticket" : "tickets"} to{" "}
          <strong>{buyerPhone}</strong> on WhatsApp and SMS. You can also open{" "}
          {tickets.length === 1 ? "it" : "them"} here right now — no need to wait.
        </p>

        <ul className="mt-5 space-y-2">
          {tickets.map((ticket, index) => (
            <li key={ticket.token}>
              <Link
                href={`/t/${ticket.token}`}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
              >
                <span className="font-medium">
                  Ticket {index + 1}
                  {tickets.length > 1 ? ` of ${tickets.length}` : ""}
                </span>
                <span className="font-mono text-sm">{ticket.code}</span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-center text-xs text-muted">
          Save these links. Anyone holding one can use it.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-xl font-bold">Confirming your payment…</h1>

      <p className="mt-3 text-sm text-muted">
        If you paid by mobile money, check <strong>{buyerPhone}</strong> for a PIN prompt
        and approve it. This usually takes under two minutes.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-card p-4 text-sm">
        <Row label="Event" value={eventName} />
        <Row label="Name" value={buyerName} />
        <Row label="Amount" value={amount} />
        <Row label="Reference" value={reference} mono />
      </div>

      <p className="mt-5 text-sm text-muted" aria-live="polite">
        {waited < 120
          ? "Waiting for your payment to confirm. Keep this page open."
          : "This is taking longer than usual. Keep this page open — if the money has left your account, your ticket will still arrive by SMS and WhatsApp."}
      </p>

      {/* Deliberately no retry button: a second attempt while the first is still in
          flight is the most common way buyers end up paying twice. */}
      <p className="mt-6 text-xs text-muted">
        Please don&rsquo;t pay again. If you were charged, your ticket is on its way even
        if you close this page. Quote reference{" "}
        <span className="font-mono">{reference}</span> if you need to contact the organizer.
      </p>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-muted">{label}</span>
      <span className={mono ? "font-mono text-xs" : "font-medium"}>{value}</span>
    </div>
  );
}
