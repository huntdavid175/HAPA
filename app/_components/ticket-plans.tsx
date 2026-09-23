"use client";

import { CheckIcon, MinusIcon, PlusIcon } from "lucide-react";

import { formatPesewas } from "@/lib/format";
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
 * Side by side from `md` up so the eye compares across a row, stacked below that. The
 * highlighted tier is scaled and outlined rather than recoloured, so it stands out
 * without the page acquiring a second accent — the gold is already spoken for by the
 * buttons, and two competing highlights read as noise.
 *
 * Adding from a card opens the drawer, which is where quantities are adjusted and the
 * order is completed. The card's own stepper appears once a tier is in the cart, so a
 * buyer who wants two of something never has to open the drawer to say so.
 */
export function TicketPlans({ checkoutOpen }: { checkoutOpen: boolean }) {
  const { tiers, quantities, bumpQty, setOpen } = useCart();

  return (
    <ul className="grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
      {tiers.map((tier) => (
        <PlanCard
          key={tier.id}
          tier={tier}
          qty={quantities[tier.id] ?? 0}
          checkoutOpen={checkoutOpen}
          onAdd={() => {
            bumpQty(tier.id, 1);
            setOpen(true);
          }}
          onBump={(delta) => bumpQty(tier.id, delta)}
        />
      ))}
    </ul>
  );
}

function PlanCard({
  tier,
  qty,
  checkoutOpen,
  onAdd,
  onBump,
}: {
  tier: CartTier;
  qty: number;
  checkoutOpen: boolean;
  onAdd: () => void;
  onBump: (delta: number) => void;
}) {
  const unavailable = unavailableLabel(tier.unavailableReason);
  const inCart = qty > 0;

  return (
    <li
      className={`relative flex flex-col border bg-card p-6 transition ${
        unavailable
          ? "border-border opacity-55"
          : tier.highlight
            ? "border-cta lg:-mt-4 lg:mb-4 lg:shadow-[0_0_0_1px_var(--cta)]"
            : "border-border"
      } ${inCart ? "ring-1 ring-cta" : ""}`}
    >
      {tier.badge && !unavailable ? (
        <span className="absolute -top-3 left-6 bg-cta px-3 py-1 text-xs font-bold tracking-[-0.01em] text-cta-foreground">
          {tier.badge}
        </span>
      ) : null}

      <h3 className="text-xl leading-tight font-bold [font-stretch:105%]">{tier.name}</h3>

      {tier.description ? (
        <p className="mt-1.5 text-sm text-muted-foreground">{tier.description}</p>
      ) : null}

      <p className="mt-5 text-4xl leading-none font-extrabold tabular-nums [font-stretch:105%]">
        {formatPesewas(tier.pricePesewas)}
      </p>

      {tier.benefits.length > 0 ? (
        <ul className="mt-6 flex flex-col gap-2.5 border-t border-border pt-6">
          {tier.benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2.5 text-sm">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-cta" />
              <span className="text-pretty">{benefit}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Pushes the action to the bottom so buttons line up across cards of different
          heights — a ragged row of buttons is what makes a pricing table look broken. */}
      <div className="mt-8 flex-1" />

      {!unavailable && tier.available <= SCARCITY_THRESHOLD ? (
        <p className="mb-3 text-sm font-medium text-warning">
          Only {tier.available} left
        </p>
      ) : null}

      {unavailable ? (
        <p className="border border-border px-6 py-3.5 text-center text-[0.95rem] font-semibold text-muted-foreground">
          {unavailable}
        </p>
      ) : inCart ? (
        <div className="js-only flex items-center justify-between gap-4 border border-cta px-3 py-2">
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
          className="js-only w-full bg-cta px-6 py-3.5 text-[0.95rem] font-bold tracking-[-0.01em] text-cta-foreground transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-cta focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          {checkoutOpen ? "Add to cart" : "Select"}
        </button>
      )}
    </li>
  );
}
