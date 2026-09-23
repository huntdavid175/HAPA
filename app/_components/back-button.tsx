"use client";

import { useSyncExternalStore } from "react";

/** History length is fixed for this page's life, so there is nothing to subscribe to. */
const neverChanges = () => () => {};

/**
 * The circular back arrow in the hero's top-left corner.
 *
 * It only appears when there is somewhere to go. A great many buyers arrive by scanning a
 * poster QR or opening a WhatsApp link, which lands them here in a fresh tab with an
 * empty history — an arrow that silently does nothing is worse than no arrow.
 *
 * `history` does not exist while rendering on the server, so the value is read through
 * `useSyncExternalStore` with a server snapshot of "no history". That renders the same
 * markup on both sides and then corrects on hydration, without the cascading re-render
 * that setting state inside an effect would cause.
 */
export function BackButton({ onImage = false }: { onImage?: boolean }) {
  const canGoBack = useSyncExternalStore(
    neverChanges,
    () => window.history.length > 1,
    () => false,
  );

  // Keeps the share button pinned right even with no arrow to balance it.
  if (!canGoBack) return <span />;

  return (
    <button
      type="button"
      onClick={() => window.history.back()}
      aria-label="Go back"
      className={`flex size-10 items-center justify-center rounded-full transition focus-visible:ring-2 focus-visible:outline-none sm:size-11 ${
        onImage
          ? "bg-white/20 text-white backdrop-blur-md hover:bg-white/30 focus-visible:ring-white"
          : "border border-border text-foreground hover:bg-card focus-visible:ring-cta"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
        aria-hidden
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>
  );
}
