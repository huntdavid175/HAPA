"use client";

import { useState } from "react";

/**
 * Description with the mockup's fade-out and centred "Show More".
 *
 * The full text is always in the DOM and the collapse is a line clamp, so search engines
 * and screen readers get the whole description either way — and the toggle only appears
 * when there is genuinely more to read, rather than teasing a two-line paragraph.
 */
export function AboutText({ text, clampAfter = 5 }: { text: string; clampAfter?: number }) {
  const [expanded, setExpanded] = useState(false);

  // Rough, deliberately generous: better to skip the toggle on a borderline paragraph
  // than to show one that reveals nothing when tapped.
  const mightOverflow = text.length > clampAfter * 62;
  const collapsed = mightOverflow && !expanded;

  return (
    <div>
      <div className="relative">
        <p
          className={`text-sm leading-relaxed text-muted-foreground sm:text-base ${
            collapsed ? "line-clamp-5" : ""
          }`}
        >
          {text}
        </p>

        {collapsed ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-background to-transparent"
          />
        ) : null}
      </div>

      {mightOverflow ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-3 flex w-full items-center justify-center gap-2 text-sm font-semibold transition hover:text-highlight"
        >
          <Chevrons up={expanded} />
          {expanded ? "Show Less" : "Show More"}
          <Chevrons up={expanded} />
        </button>
      ) : null}
    </div>
  );
}

function Chevrons({ up }: { up: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-4 ${up ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="m7 7 5 5 5-5" />
      <path d="m7 13 5 5 5-5" />
    </svg>
  );
}
