"use client";

import { useState } from "react";

/**
 * The circular control in the hero's top corner.
 *
 * The mockup puts a bookmark here, but nothing in this product can remember a bookmark —
 * buyers never sign in. Sharing is the action that actually matters: word of mouth on
 * WhatsApp is how these events fill, so the button does the thing the organiser wants.
 *
 * `navigator.share` is the native sheet on Android and iOS, which is where nearly every
 * buyer is. Desktop browsers mostly lack it, so those fall back to copying the link.
 */
export function ShareButton({
  eventName,
  onImage = false,
}: {
  eventName: string;
  onImage?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: eventName, url });
        return;
      } catch {
        // The user dismissed the sheet, or the browser refused — fall through to copying.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context, or permission denied). Nothing useful left
      // to try, and a thrown error here would take the whole page down.
    }
  }

  return (
    <div className="flex items-center gap-2">
      {copied ? (
        <span
          role="status"
          className="rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm"
        >
          Link copied
        </span>
      ) : null}

      <button
        type="button"
        onClick={share}
        aria-label={`Share ${eventName}`}
        className={`flex size-10 items-center justify-center rounded-full transition focus-visible:ring-2 focus-visible:outline-none sm:size-11 ${
          onImage
            ? "bg-white/25 text-white backdrop-blur-md hover:bg-white/35 focus-visible:ring-white"
            : "border border-border text-foreground hover:bg-card focus-visible:ring-cta"
        }`}
      >
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
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
          <path d="M12 15V3" />
          <path d="m8 7 4-4 4 4" />
        </svg>
      </button>
    </div>
  );
}
