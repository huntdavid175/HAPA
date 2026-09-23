"use client";

import { useState } from "react";

/**
 * The two things a buyer does with a ticket they already own: keep a copy, or pass it on.
 *
 * "Save as PDF" is the browser's own print dialog rather than a generated file. Every
 * mobile browser's print sheet offers "Save as PDF" / "Save to Files", it needs no
 * server round trip on a phone that may be on a bar of signal at the gate, and the
 * print stylesheet in globals.css makes what comes out the pass and nothing else.
 *
 * Sharing hands over the ticket itself — the link IS the admission, which is why the
 * label says so rather than a neutral "Share".
 */
export function TicketActions({ eventName }: { eventName: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: `Your ticket · ${eventName}`, url });
        return;
      } catch {
        // Dismissed, or refused by the browser — fall through to copying.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context or denied permission). Throwing here would
      // take down a page whose whole job is to be readable at a door.
    }
  }

  return (
    <div className="print-hide js-only mt-6 flex items-center gap-3">
      <button
        type="button"
        onClick={() => window.print()}
        className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-cta px-6 text-[0.95rem] font-semibold text-cta-foreground transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-cta focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      >
        Save as PDF
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
          aria-hidden
        >
          <path d="M7 17 17 7" />
          <path d="M8 7h9v9" />
        </svg>
      </button>

      <button
        type="button"
        onClick={share}
        aria-label="Send this ticket to someone"
        className="relative flex size-14 shrink-0 items-center justify-center rounded-full bg-highlight text-highlight-foreground transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-highlight focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      >
        {copied ? (
          <span
            role="status"
            className="absolute -top-9 right-0 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium whitespace-nowrap text-background"
          >
            Link copied
          </span>
        ) : null}

        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
          aria-hidden
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.6 13.5 6.8 4" />
          <path d="m15.4 6.5-6.8 4" />
        </svg>
      </button>
    </div>
  );
}
