import { formatEventDateRange, formatEventTime } from "@/lib/format";
import { isFullyUnavailable, type EventWithTiers } from "@/lib/events";
import { paymentsEnabled } from "@/lib/env";
import { ensureRichText } from "@/lib/rich-text";
import { cheapestPrice } from "@/lib/pricing";
import { toCurrency } from "@/lib/currency";
import { EventHero } from "./event-hero";
import { AboutText } from "./about-text";
import { CartProvider, type CartTier } from "./cart";
import { BuyRail, BuyBar, TicketPlansSection } from "./buy-panel";
import { TicketDrawer } from "./ticket-drawer";

/**
 * The buyer's first screen — usually reached by scanning a QR on a poster or tapping a
 * link in WhatsApp. Everything above the fold answers "what, when, where, how much".
 *
 * The page is built as a ticket: the hero is the stub, the perforation below it is the
 * tear, and the detail below is what you keep. Choosing a tier happens in a sheet rather
 * than further down the page, so nobody loses sight of the event while deciding.
 *
 * Pinned dark via `theme-night` whatever the device prefers; see globals.css for why.
 */
export function EventView({ event }: { event: EventWithTiers }) {
  const soldOut = isFullyUnavailable(event);
  const salesClosed = event.status === "sales_closed";
  const canBuy = !soldOut && !salesClosed && event.tiers.length > 0;
  const checkoutOpen = canBuy && paymentsEnabled();

  const cheapest = cheapestPrice(event.tiers);

  const unavailableNotice = salesClosed
    ? "Ticket sales have closed. If you already bought one it is still valid — check your WhatsApp or SMS."
    : soldOut
      ? "Every ticket has been sold. If more are released they will appear here."
      : event.tiers.length === 0
        ? "No ticket types have been set up for this event yet."
        : null;

  const cartTiers: CartTier[] = event.tiers.map((tier) => ({
    id: tier.id,
    name: tier.name,
    description: tier.description,
    benefits: tier.benefits ?? [],
    pricePesewas: tier.price_pesewas,
    currency: toCurrency(tier.currency),
    available: tier.available,
    unavailableReason: tier.unavailableReason,
    highlight: tier.highlight ?? false,
    badge: tier.badge,
  }));

  return (
    <CartProvider tiers={cartTiers}>
      <main className="theme-night min-h-dvh bg-background pb-28 text-foreground lg:pb-20">
        {/* A trigger that cannot open anything is worse than no trigger, so the sheet's
          buttons are hidden without JavaScript and the tiers render inline instead. */}
        <noscript>
          <style>{`.js-only{display:none!important}.noscript-tiers{display:block!important}`}</style>
        </noscript>

        <div className="mx-auto w-full max-w-5xl">
          <EventHero src={event.cover_image} eventName={event.name} />
        </div>

        <div className="mx-auto w-full max-w-5xl px-6 sm:px-8">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-x-14">
            <header className="pt-7 lg:col-start-1 lg:row-start-1">
              <h1
                className={`text-balance break-words ${titleClass(event.name)}`}
              >
                {event.name}
              </h1>

              {event.venue ? (
                <p className="mt-5 flex items-start gap-2.5 text-[0.95rem] text-muted-foreground">
                  <PinIcon />
                  {event.venue}
                </p>
              ) : null}

              {event.description ? (
                <div className="mt-7 max-w-[62ch]">
                  <AboutText html={ensureRichText(event.description)} />
                </div>
              ) : null}
            </header>

            {/* Mobile: in the flow under the description. Desktop: a sticky rail. */}
            <div className="mt-10 lg:sticky lg:top-10 lg:col-start-2 lg:row-start-1 lg:mt-8 lg:self-start">
              <dl className="divide-y divide-border border-y border-border">
                <Fact label="Date">
                  {formatEventDateRange(event.starts_at, event.ends_at, event.timezone)}
                </Fact>
                <Fact label="Doors open">
                  {formatEventTime(event.starts_at, event.timezone)}
                </Fact>

                {/* Only when the organiser actually set an end — inventing one would put a
                  time on the page that nobody committed to. */}
                {event.ends_at ? (
                  <Fact label="Doors close">
                    {formatEventTime(event.ends_at, event.timezone)}
                  </Fact>
                ) : null}
              </dl>

              <BuyRail
                checkoutOpen={checkoutOpen}
                soldOut={soldOut}
                salesClosed={salesClosed}
                cheapest={cheapest}
              />
            </div>
          </div>

          <TicketPlansSection
            checkoutOpen={checkoutOpen}
            soldOut={soldOut}
            salesClosed={salesClosed}
          />
        </div>

        <BuyBar
          checkoutOpen={checkoutOpen}
          soldOut={soldOut}
          salesClosed={salesClosed}
          cheapest={cheapest}
        />

        <TicketDrawer
          eventId={event.id}
          checkoutOpen={checkoutOpen}
          unavailableNotice={unavailableNotice}
        />

      </main>
    </CartProvider>
  );
}

/**
 * Sizes the title to how long it actually is.
 *
 * A fixed poster size only works for a poster-length name. "HAPAwards — 10th Anniversary,
 * Ghana Edition" and the rest of its official title runs to 86 characters, and at display
 * size that filled a phone screen eight lines deep, pushing the venue, the date and the
 * buy button below the fold. Real event names are long, so the scale bends to them.
 *
 * The loud treatment — heaviest weight, widest width, tightest tracking — is reserved for
 * names short enough to survive it. Long names step down in size *and* calm down in
 * weight and width, because expanded ultra-bold is exhausting to read over four lines.
 *
 * Length rather than a fluid `clamp()`: viewport width tells you nothing about how many
 * characters have to fit in it, and this needs no JavaScript and shifts no layout.
 */
function titleClass(name: string): string {
  const n = name.trim().length;

  if (n <= 24) {
    return "text-[2.25rem] leading-[0.95] font-extrabold tracking-[-0.03em] [font-stretch:110%] sm:text-5xl lg:text-6xl";
  }
  if (n <= 55) {
    return "text-[1.75rem] leading-[1] font-extrabold tracking-[-0.02em] [font-stretch:105%] sm:text-4xl lg:text-5xl";
  }
  return "text-[1.375rem] leading-[1.15] font-bold tracking-[-0.01em] sm:text-[1.625rem] lg:text-3xl";
}



function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-5 py-3.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-semibold text-pretty">
        {children}
      </dd>
    </div>
  );
}


function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 size-4 shrink-0"
      aria-hidden
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
