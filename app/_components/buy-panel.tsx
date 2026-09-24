"use client";

import { useEffect, useRef } from "react";

import { formatPesewas } from "@/lib/format";
import type { Price } from "@/lib/pricing";
import { useCart } from "./cart";
import { useInView } from "./use-in-view";
import { TicketPlans } from "./ticket-plans";

type Availability = {
  checkoutOpen: boolean;
  soldOut: boolean;
  salesClosed: boolean;
};

/**
 * The pricing cards, full width at the foot of the page.
 *
 * It reports its own visibility into the cart so the two floating buy panels can get out
 * of the way: while these cards are on screen every one of them carries its own button,
 * and a panel repeating the same offer just covers what the buyer came to read.
 */
export function TicketPlansSection({
  soldOut,
  salesClosed,
}: Availability) {
  const ref = useRef<HTMLElement>(null);
  // A little slack at the bottom, so the panel goes once the cards are meaningfully in
  // view rather than the instant one pixel of the first card appears.
  const inView = useInView(ref, "0px 0px -20% 0px");
  const { setPlansInView } = useCart();

  useEffect(() => {
    setPlansInView(inView);
  }, [inView, setPlansInView]);

  const unavailable = soldOut || salesClosed;

  return (
    <section ref={ref} id="tickets" className="mt-16 scroll-mt-8">
      <h2 className="text-2xl leading-tight font-extrabold tracking-[-0.02em] [font-stretch:105%] sm:text-3xl">
        Tickets
      </h2>
      <p className="mt-2 max-w-[52ch] text-muted-foreground">
        {unavailable
          ? salesClosed
            ? "Sales have closed. If you already bought a ticket it is still valid — check your WhatsApp or SMS."
            : "Every ticket has been sold. If more are released they will appear here."
          : "Pick what suits you. Nothing is charged until you pay."}
      </p>

      <div className="mt-8">
        <TicketPlans />
      </div>
    </section>
  );
}

/** The desktop rail's price and button. Redundant once the cards are visible. */
export function BuyRail({ cheapest, ...availability }: Availability & { cheapest: Price | null }) {
  const { plansInView } = useCart();

  return (
    <div
      className={`mt-7 hidden transition-opacity duration-200 lg:block ${
        plansInView ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      aria-hidden={plansInView}
    >
      <PriceLabel cheapest={cheapest} />
      <div className="mt-4">
        <Cta {...availability} block />
      </div>
    </div>
  );
}

/**
 * The fixed bar on a phone.
 *
 * Hides while the cards are on screen, like the rail — but comes back the moment there is
 * something in the cart, because at that point it stops being an offer and becomes the
 * way to check out without scrolling back up.
 */
export function BuyBar({ cheapest, ...availability }: Availability & { cheapest: Price | null }) {
  const { plansInView, ticketCount } = useCart();
  const show = !plansInView || ticketCount > 0;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md transition-transform duration-200 lg:hidden ${
        show ? "translate-y-0" : "translate-y-full"
      }`}
      aria-hidden={!show}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-5">
        <PriceLabel cheapest={cheapest} />
        <Cta {...availability} />
      </div>
    </div>
  );
}

/** Shows the cart total once there is one, and the cheapest ticket before that. */
function PriceLabel({ cheapest }: { cheapest: Price | null }) {
  const { ticketCount, totalPesewas, currency } = useCart();

  if (ticketCount > 0) {
    return (
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {ticketCount} ticket{ticketCount === 1 ? "" : "s"}
        </p>
        <p className="text-2xl leading-none font-extrabold tabular-nums [font-stretch:105%]">
          {formatPesewas(totalPesewas, currency ?? undefined)}
        </p>
      </div>
    );
  }

  if (cheapest === null) {
    return <p className="text-sm text-muted-foreground">No tickets on sale</p>;
  }

  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">From</p>
      <p className="text-2xl leading-none font-extrabold tabular-nums [font-stretch:105%]">
        {formatPesewas(cheapest.pesewas, cheapest.currency)}
      </p>
    </div>
  );
}

/**
 * With an empty cart this is a link to the cards, so it still works without JavaScript.
 * Once there is something in the cart it opens the drawer instead — the next thing the
 * buyer wants is to pay, not to browse the list again.
 */
function Cta({
  checkoutOpen,
  soldOut,
  salesClosed,
  block = false,
}: Availability & { block?: boolean }) {
  const { ticketCount, setOpen } = useCart();
  const shape = `${block ? "block w-full" : "shrink-0"} bg-cta px-8 py-3.5 text-center text-[0.95rem] font-bold tracking-[-0.01em] text-cta-foreground transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-cta focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none`;

  if (soldOut || salesClosed) {
    return (
      <p
        className={`${block ? "block w-full" : "shrink-0"} border border-border px-7 py-3.5 text-center text-[0.95rem] font-semibold text-muted-foreground`}
      >
        {salesClosed ? "Sales closed" : "Sold out"}
      </p>
    );
  }

  if (ticketCount > 0) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={shape}>
        {checkoutOpen ? "Checkout" : "View cart"}
      </button>
    );
  }

  return (
    <a href="#tickets" className={shape}>
      {checkoutOpen ? "Buy a ticket" : "See tickets"}
    </a>
  );
}
