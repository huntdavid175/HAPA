"use client";

import { useState } from "react";

/**
 * The event description, as rich text.
 *
 * `html` is already sanitised — it is cleaned in the save action against a small
 * allowlist before it reaches the database, so nothing unsafe can be stored in the first
 * place. See lib/rich-text.ts.
 *
 * The collapse is a line clamp rather than a truncation, so the whole description is in
 * the DOM either way and search engines and screen readers get all of it. The toggle only
 * appears when there is genuinely more to read.
 */
export function AboutText({ html, clampAfter = 5 }: { html: string; clampAfter?: number }) {
  const [expanded, setExpanded] = useState(false);

  // Rough, and measured against the text rather than the markup — tags are invisible to
  // a reader, so counting them would show a toggle that reveals nothing.
  const textLength = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length;
  const mightOverflow = textLength > clampAfter * 62;
  const collapsed = mightOverflow && !expanded;

  return (
    <div>
      <div className="relative">
        <div
          className={`prose-event text-sm leading-relaxed text-muted-foreground sm:text-base ${
            collapsed ? "line-clamp-5" : ""
          }`}
          dangerouslySetInnerHTML={{ __html: html }}
        />

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
