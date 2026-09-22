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
      className="w-full rounded-lg bg-accent px-4 py-3.5 text-base font-semibold text-accent-foreground disabled:opacity-50"
    >
      {pending
        ? "Taking you to payment…"
        : total === 0
          ? "Choose a ticket"
          : `Pay ${formatPesewas(total)}`}
    </button>
  );
}

export function TicketPicker({
  eventId,
  tiers,
}: {
  eventId: string;
  tiers: PickerTier[];
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

  function setQty(tierId: string, next: number, max: number) {
    setQuantities((prev) => ({
      ...prev,
      [tierId]: Math.max(0, Math.min(next, Math.min(max, MAX_PER_TIER))),
    }));
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      <ul className="space-y-3">
        {tiers.map((tier) => {
          const qty = quantities[tier.id] ?? 0;
          const disabled = tier.unavailableReason !== null;
          const cap = Math.min(tier.available, MAX_PER_TIER);

          return (
            <li
              key={tier.id}
              className={`rounded-xl border border-border bg-card p-4 ${disabled ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-semibold">{tier.name}</h3>
                  {tier.description ? (
                    <p className="mt-0.5 text-sm text-muted">{tier.description}</p>
                  ) : null}
                </div>
                <p className="shrink-0 font-semibold tabular-nums">
                  {formatPesewas(tier.pricePesewas)}
                </p>
              </div>

              {disabled ? (
                <p className="mt-3 text-sm font-medium text-muted">
                  {tier.unavailableReason === "sold_out"
                    ? "Sold out"
                    : tier.unavailableReason === "not_yet_on_sale"
                      ? "Not on sale yet"
                      : "Sales closed"}
                </p>
              ) : (
                <div className="mt-3 flex items-center justify-between gap-3">
                  {tier.available <= 20 ? (
                    <p className="text-sm text-warning">Only {tier.available} left</p>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setQty(tier.id, qty - 1, cap)}
                      disabled={qty === 0}
                      aria-label={`One fewer ${tier.name}`}
                      className="h-10 w-10 rounded-lg border border-border text-lg disabled:opacity-40"
                    >
                      −
                    </button>
                    <span
                      className="w-6 text-center text-lg font-semibold tabular-nums"
                      aria-live="polite"
                      aria-label={`${qty} ${tier.name}`}
                    >
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQty(tier.id, qty + 1, cap)}
                      disabled={qty >= cap}
                      aria-label={`One more ${tier.name}`}
                      className="h-10 w-10 rounded-lg border border-border text-lg disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {ticketCount > 0 ? (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">Your details</h2>
          <p className="-mt-2 text-sm text-muted">
            Your {ticketCount === 1 ? "ticket goes" : "tickets go"} to this number by
            WhatsApp and SMS.
          </p>

          <div>
            <label htmlFor="name" className="block text-sm font-medium">Full name</label>
            <input
              id="name" name="name" required autoComplete="name"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-3 text-base"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium">Phone number</label>
            <input
              id="phone" name="phone" type="tel" required
              inputMode="tel" autoComplete="tel" placeholder="024 123 4567"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-3 text-base"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium">Email</label>
            <input
              id="email" name="email" type="email" required autoComplete="email"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-3 text-base"
            />
            <p className="mt-1 text-xs text-muted">
              A backup copy goes here in case the message does not reach your phone.
            </p>
          </div>

          {state.error ? (
            <p role="alert" className="text-sm font-medium text-accent">{state.error}</p>
          ) : null}

          <PayButton total={total} />

          <p className="text-center text-xs text-muted">
            Pay with mobile money or card. Your {ticketCount === 1 ? "ticket" : "tickets"}{" "}
            will be held for 10 minutes while you pay.
          </p>
        </div>
      ) : null}
    </form>
  );
}
