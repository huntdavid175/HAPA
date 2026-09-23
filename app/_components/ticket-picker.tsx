"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { startCheckout, type CheckoutState } from "@/app/checkout/actions";

export type PickerTier = {
  id: string;
  name: string;
  description: string;
  pricePesewas: number;
  available: number;
  unavailableReason: string | null;
};

const initial: CheckoutState = { error: null };

/** Mirrors the order_items CHECK constraint, so the UI cannot offer an invalid quantity. */
const MAX_PER_TIER = 20;

function formatPesewas(p: number) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
  }).format(p / 100);
}

function PayButton({ total }: { total: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || total === 0}
      className="w-full bg-cta px-6 py-3.5 text-[0.95rem] font-bold text-cta-foreground transition hover:brightness-95 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-cta focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      {pending ? "Taking you to payment…" : `Pay ${formatPesewas(total)}`}
    </button>
  );
}

/**
 * Choosing tickets.
 *
 * Selection has to be legible at a glance, so a chosen tier is marked three ways at once:
 * a gold ring around the whole stub, the count in the stub beside the price, and a
 * running total pinned under the list. One quiet number between a minus and a plus is not
 * enough feedback for someone about to hand over money.
 *
 * The picker renders whether or not payments are switched on. Selecting is how a buyer
 * works out what the night costs, and that question is worth answering even while the
 * Paystack account is still being verified — only the final step is gated.
 */
export function TicketPicker({
  eventId,
  tiers,
  checkoutOpen,
}: {
  eventId: string;
  tiers: PickerTier[];
  checkoutOpen: boolean;
}) {
  const [state, action] = useActionState(startCheckout, initial);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const total = useMemo(
    () =>
      tiers.reduce(
        (sum, tier) => sum + tier.pricePesewas * (quantities[tier.id] ?? 0),
        0,
      ),
    [tiers, quantities],
  );

  const items = useMemo(
    () =>
      Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([tier_id, quantity]) => ({ tier_id, quantity })),
    [quantities],
  );

  const ticketCount = items.reduce((n, i) => n + i.quantity, 0);

  /**
   * Derives the new quantity from the previous state, not from the rendered value.
   *
   * Two taps on "+" inside one render both read the same `qty` from the closure, so the
   * second overwrote the first with the same number and a ticket silently vanished. On a
   * phone, buying three tickets is three fast taps, so this mattered.
   */
  function bumpQty(tierId: string, delta: number, max: number) {
    setQuantities((prev) => {
      const current = prev[tierId] ?? 0;
      const ceiling = Math.min(max, MAX_PER_TIER);
      return { ...prev, [tierId]: Math.max(0, Math.min(current + delta, ceiling)) };
    });
  }

  return (
    <form action={action}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      <ul className="space-y-7">
        {tiers.map((tier) => {
          const qty = quantities[tier.id] ?? 0;
          const disabled = tier.unavailableReason !== null;
          const cap = Math.min(tier.available, MAX_PER_TIER);
          const selected = qty > 0;

          return (
            <li
              key={tier.id}
              className={`stub grid grid-cols-[minmax(0,1fr)_var(--stub-width)] border bg-card transition ${
                disabled
                  ? "border-border opacity-55"
                  : selected
                    ? "border-cta ring-1 ring-cta"
                    : "border-border"
              }`}
            >
              <div className="p-5">
                <h3 className="text-lg leading-tight font-bold [font-stretch:105%]">
                  {tier.name}
                </h3>

                {tier.description ? (
                  <p className="mt-1.5 text-sm text-muted-foreground">{tier.description}</p>
                ) : null}

                {disabled ? (
                  <p className="mt-3 text-sm font-medium text-muted-foreground">
                    {tier.unavailableReason === "sold_out"
                      ? "Sold out"
                      : tier.unavailableReason === "not_yet_on_sale"
                        ? "Not on sale yet"
                        : "Sales closed"}
                  </p>
                ) : (
                  <>
                    {tier.available <= 20 ? (
                      <p className="mt-3 text-sm font-medium text-warning">
                        Only {tier.available} left
                      </p>
                    ) : null}

                    <div className="mt-4 flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => bumpQty(tier.id, -1, cap)}
                        disabled={qty === 0}
                        aria-label={`One fewer ${tier.name}`}
                        className="flex size-10 items-center justify-center rounded-full border border-border text-xl leading-none transition hover:border-foreground disabled:opacity-30 disabled:hover:border-border"
                      >
                        −
                      </button>

                      <span
                        className="w-5 text-center text-lg font-bold tabular-nums"
                        aria-live="polite"
                        aria-label={`${qty} ${tier.name} selected`}
                      >
                        {qty}
                      </span>

                      <button
                        type="button"
                        onClick={() => bumpQty(tier.id, 1, cap)}
                        disabled={qty >= cap}
                        aria-label={`One more ${tier.name}`}
                        className="flex size-10 items-center justify-center rounded-full border border-border text-xl leading-none transition hover:border-foreground disabled:opacity-30 disabled:hover:border-border"
                      >
                        +
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-col items-center justify-center gap-1.5 border-l-2 border-dashed border-border p-3 text-center">
                <p className="text-base leading-none font-extrabold tabular-nums">
                  {formatPesewas(tier.pricePesewas)}
                </p>

                {selected ? (
                  <p className="bg-cta px-2 py-0.5 text-xs leading-none font-bold text-cta-foreground tabular-nums">
                    × {qty}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Sticks to the bottom of the sheet so the running total stays in view while the
          list scrolls — the answer to "what is tonight going to cost me". */}
      <div className="sticky bottom-0 -mx-6 mt-8 border-t border-border bg-background px-6 pt-4 pb-1">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {ticketCount === 0
              ? "No tickets selected"
              : `${ticketCount} ticket${ticketCount === 1 ? "" : "s"}`}
          </p>
          <p className="text-xl font-extrabold tabular-nums [font-stretch:105%]">
            {formatPesewas(total)}
          </p>
        </div>

        {!checkoutOpen ? (
          <p className="mt-3 border-l-2 border-border pl-4 text-sm text-muted-foreground">
            Card and mobile money payments are being switched on. Once they are live you
            will pay here and get your tickets on WhatsApp and SMS straight away.
          </p>
        ) : null}
      </div>

      {checkoutOpen && ticketCount > 0 ? (
        <div className="mt-8 space-y-4 border-t border-border pt-6">
          <div>
            <h3 className="text-lg font-bold [font-stretch:105%]">Your details</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your {ticketCount === 1 ? "ticket goes" : "tickets go"} to this number by
              WhatsApp and SMS.
            </p>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium">Full name</label>
            <input
              id="name" name="name" required autoComplete="name"
              className="mt-1.5 w-full border border-border bg-card px-3 py-3 text-base focus-visible:border-cta focus-visible:outline-none"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium">Phone number</label>
            <input
              id="phone" name="phone" type="tel" required
              inputMode="tel" autoComplete="tel" placeholder="024 123 4567"
              className="mt-1.5 w-full border border-border bg-card px-3 py-3 text-base focus-visible:border-cta focus-visible:outline-none"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium">Email</label>
            <input
              id="email" name="email" type="email" required autoComplete="email"
              className="mt-1.5 w-full border border-border bg-card px-3 py-3 text-base focus-visible:border-cta focus-visible:outline-none"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              A backup copy goes here in case the message does not reach your phone.
            </p>
          </div>

          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">{state.error}</p>
          ) : null}

          <PayButton total={total} />

          <p className="text-center text-xs text-muted-foreground">
            Pay with mobile money or card. Your {ticketCount === 1 ? "ticket" : "tickets"}{" "}
            will be held for 10 minutes while you pay.
          </p>
        </div>
      ) : null}
    </form>
  );
}
