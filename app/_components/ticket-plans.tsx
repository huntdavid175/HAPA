"use client";

import { CheckIcon, MinusIcon, PlusIcon } from "lucide-react";

import { formatPesewas, formatPesewasParts } from "@/lib/format";
import { useCart, type CartTier } from "./cart";

/** Only show a count when it is low enough to actually mean something. */
const SCARCITY_THRESHOLD = 20;

function unavailableLabel(reason: string | null) {
  if (reason === "sold_out") return "Sold out";
  if (reason === "not_yet_on_sale") return "Not on sale yet";
  if (reason === "sales_ended") return "Sales closed";
  return null;
}

/**
 * The pricing cards.
 *
 * Side by side from `md` up so the eye compares across a row, stacked below that. Each
 * card is its own `.theme-plan` scope, blue on the night page. The highlighted tier is the
 * same blue with a heavy gold border. Every card carries the same 4px border — the rest
 * transparent — and none is lifted, so all of them are exactly the same size.
 *
 * Adding from a card opens the drawer, which is where quantities are adjusted and the
 * order is completed. The card's own stepper appears once a tier is in the cart, so a
 * buyer who wants two of something never has to open the drawer to say so.
 */
export function TicketPlans() {
  const { tiers, quantities, bumpQty, addTier } = useCart();

  return (
    <ul className="grid items-stretch gap-6 md:auto-rows-fr md:gap-8 md:grid-cols-2 lg:grid-cols-3">
      {tiers.map((tier) => (
        <PlanCard
          key={tier.id}
          tier={tier}
          qty={quantities[tier.id] ?? 0}
          onAdd={() => addTier(tier.id)}
          onBump={(delta) => bumpQty(tier.id, delta)}
        />
      ))}
    </ul>
  );
}

function PlanCard({
  tier,
  qty,
  onAdd,
  onBump,
}: {
  tier: CartTier;
  qty: number;
  onAdd: () => void;
  onBump: (delta: number) => void;
}) {
  const unavailable = unavailableLabel(tier.unavailableReason);
  const inCart = qty > 0;
  const price = formatPesewasParts(tier.pricePesewas, tier.currency);

  return (
    <li
      className={`theme-plan relative flex flex-col border-4 bg-card text-card-foreground transition ${
        unavailable
          ? "border-transparent opacity-55"
          : tier.highlight
            ? "plan-featured border-cta"
            : "border-transparent"
      }`}
    >
      {tier.badge && !unavailable ? (
        <span className="absolute -top-3 left-6 bg-cta px-3 py-1 text-xs font-bold tracking-[-0.01em] text-cta-foreground">
          {tier.badge}
        </span>
      ) : null}

      {/* The ticket: what it is and what it gets you. Takes up whatever height the row
          gives it, so the tear and the stub below sit level across every card. */}
      <div className="flex-1 px-6 pt-7 pb-6">
        <h3 className="text-xl leading-tight font-bold [font-stretch:105%]">
          {tier.name}
        </h3>

        {tier.description ? (
          <p className="mt-1.5 text-sm text-muted-foreground">{tier.description}</p>
        ) : null}

        {tier.benefits.length > 0 ? (
          <ul className="mt-5 flex flex-col gap-2.5">
            {tier.benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5 text-sm">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-cta" />
                <span className="text-pretty">{benefit}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="plan-tear" aria-hidden />

      {/* The stub: what it costs and the button that buys it. One fixed shape on every
          card — scarcity shares the price's line rather than adding one, and the button,
          the stepper and the sold-out label are all h-13 — so the tear stays level
          across the row. The stepper is the in-cart signal; a gold ring as well would
          be mistaken for the highlighted tier's border. */}
      <div className="flex flex-col gap-4 px-6 pt-5 pb-6">
        <div className="flex items-baseline justify-between gap-3">
          {/* Only the amount is set large: it is what buyers compare across cards. The
              symbol and pesewas are the same on every card and sit back beside it. */}
          <p className="tabular-nums">
            <span className="sr-only">{formatPesewas(tier.pricePesewas, tier.currency)}</span>
            <span aria-hidden className="flex items-baseline gap-0.5">
              <span className="text-sm font-semibold text-muted-foreground">
                {price.currency}
              </span>
              <span className="text-2xl leading-none font-bold tracking-[-0.02em]">
                {price.amount}
              </span>
              <span className="text-sm font-semibold text-muted-foreground">
                {price.fraction}
              </span>
            </span>
          </p>

          {!unavailable && tier.available <= SCARCITY_THRESHOLD ? (
            <p className="text-right text-sm font-medium text-warning">
              Only {tier.available} left
            </p>
          ) : null}
        </div>

        {unavailable ? (
          <p className="flex h-13 items-center justify-center border border-border px-6 text-center text-[0.95rem] font-semibold text-muted-foreground">
            {unavailable}
          </p>
        ) : inCart ? (
          <div className="js-only flex h-13 items-center justify-between gap-4 border border-cta px-2">
            <button
              type="button"
              onClick={() => onBump(-1)}
              aria-label={`One fewer ${tier.name}`}
              className="flex size-10 items-center justify-center rounded-full text-foreground transition hover:bg-background"
            >
              <MinusIcon className="size-4" />
            </button>

            <span aria-live="polite" className="text-sm font-semibold">
              {qty} in cart
            </span>

            <button
              type="button"
              onClick={() => onBump(1)}
              disabled={qty >= Math.min(tier.available, 20)}
              aria-label={`One more ${tier.name}`}
              className="flex size-10 items-center justify-center rounded-full text-foreground transition hover:bg-background disabled:opacity-30"
            >
              <PlusIcon className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            className="js-only h-13 w-full bg-cta px-6 text-[0.95rem] font-bold tracking-[-0.01em] text-cta-foreground transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-cta focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            Get ticket
          </button>
        )}
      </div>
    </li>
  );
}
