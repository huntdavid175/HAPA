"use client";

import { useEffect, useRef } from "react";

export const DRAWER_ID = "ticket-drawer";

/**
 * The ticket sheet.
 *
 * Built on the native `<dialog>` rather than a div with a high z-index, because
 * `showModal()` hands us the things a hand-rolled drawer usually gets wrong: focus moves
 * into the sheet and is trapped there, Escape closes it, the rest of the page goes inert
 * for assistive tech, and it renders in the top layer so nothing can paint over it.
 *
 * One sheet, opened from two places — the fixed bar on a phone and the rail on desktop —
 * so the tier markup exists once. The triggers find it by id rather than through context,
 * which keeps them independent of where they sit in the tree.
 */
export function TicketDrawer({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // `showModal()` does not stop the page behind from scrolling on iOS, so the sheet
  // would drag the event page with it.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const lock = () => {
      document.body.style.overflow = dialog.open ? "hidden" : "";
    };

    const observer = new MutationObserver(lock);
    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });

    return () => {
      observer.disconnect();
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <dialog
      ref={ref}
      id={DRAWER_ID}
      aria-labelledby={`${DRAWER_ID}-title`}
      className="ticket-drawer theme-night"
      // A click that starts and ends on the dialog element itself landed on the backdrop:
      // the sheet's own content sits in the inner wrapper.
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
    >
      <div className="flex max-h-[85dvh] flex-col bg-background text-foreground">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <h2 id={`${DRAWER_ID}-title`} className="text-xl font-bold [font-stretch:105%]">
            {title}
          </h2>

          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="-mt-1 -mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-cta focus-visible:outline-none"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="size-5"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </dialog>
  );
}

/**
 * Opens the sheet.
 *
 * Hidden entirely when JavaScript is unavailable — see the `noscript` rule in
 * globals.css — because a button that cannot do anything is worse than no button. The
 * tiers render inline in that case instead.
 */
export function OpenTicketsButton({
  label,
  block = false,
}: {
  label: string;
  block?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        const dialog = document.getElementById(DRAWER_ID);
        if (dialog instanceof HTMLDialogElement) dialog.showModal();
      }}
      className={`js-only ${
        block ? "block w-full" : "shrink-0"
      } bg-cta px-8 py-3.5 text-center text-[0.95rem] font-bold tracking-[-0.01em] text-cta-foreground transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-cta focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none`}
    >
      {label}
    </button>
  );
}
