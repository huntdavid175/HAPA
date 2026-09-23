"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { MinusIcon, PlusIcon, TicketIcon } from "lucide-react";

import { startCheckout, type CheckoutState } from "@/app/checkout/actions";
import { formatPesewas } from "@/lib/format";
import { useCart, MAX_PER_TIER } from "./cart";

const initial: CheckoutState = { error: null };

function PayButton({ total }: { total: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || total === 0}
      className="w-full bg-cta px-6 py-3.5 text-[0.95rem] font-bold text-cta-foreground transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-cta focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none disabled:opacity-40"
    >
      {pending ? "Taking you to payment…" : `Pay ${formatPesewas(total)}`}
    </button>
  );
}

/**
 * What is in the cart, and the form that turns it into an order.
 *
 * Only tiers with a quantity appear. An empty cart says so plainly rather than listing
 * every tier at zero — the pricing cards behind the drawer are already that list, and
 * repeating it here would just be a second place to change the same numbers.
 */
export function CartContents({
  eventId,
  checkoutOpen,
}: {
  eventId: string;
  checkoutOpen: boolean;
}) {
  const [state, action] = useActionState(startCheckout, initial);
  const { tiers, quantities, bumpQty, items, ticketCount, totalPesewas, setOpen } =
    useCart();

  const chosen = tiers.filter((tier) => (quantities[tier.id] ?? 0) > 0);

  if (chosen.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <TicketIcon className="size-8 text-muted-foreground" />
        <div>
          <p className="font-semibold">No tickets yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Close this and pick a ticket to add one.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="border border-border px-6 py-2.5 text-sm font-semibold transition hover:border-foreground"
        >
          See the tickets
        </button>
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      {/* The same ticket shape the tiers use on the page: name and stepper on the left,
          price torn off behind the perforation, gold ring because it is in the cart.
          A plain list would have been lighter, but the stub is how a ticket looks here
          and the cart is the last place to break that. */}
      <ul className="space-y-7">
        {chosen.map((tier) => {
          const qty = quantities[tier.id] ?? 0;
          const cap = Math.min(tier.available, MAX_PER_TIER);

          return (
            <li
              key={tier.id}
              className="stub grid grid-cols-[minmax(0,1fr)_var(--stub-width)] border border-cta bg-card ring-1 ring-cta"
            >
              <div className="p-5">
                <h3 className="text-lg leading-tight font-bold [font-stretch:105%]">
                  {tier.name}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground tabular-nums">
                  {formatPesewas(tier.pricePesewas)} each
                </p>

                <div className="mt-4 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => bumpQty(tier.id, -1)}
                    aria-label={`One fewer ${tier.name}`}
                    className="flex size-10 items-center justify-center rounded-full border border-border text-xl leading-none transition hover:border-foreground"
                  >
                    <MinusIcon className="size-4" />
                  </button>

                  <span
                    aria-live="polite"
                    aria-label={`${qty} ${tier.name} selected`}
                    className="w-5 text-center text-lg font-bold tabular-nums"
                  >
                    {qty}
                  </span>

                  <button
                    type="button"
                    onClick={() => bumpQty(tier.id, 1)}
                    disabled={qty >= cap}
                    aria-label={`One more ${tier.name}`}
                    className="flex size-10 items-center justify-center rounded-full border border-border text-xl leading-none transition hover:border-foreground disabled:opacity-30 disabled:hover:border-border"
                  >
                    <PlusIcon className="size-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center gap-1.5 border-l-2 border-dashed border-border p-3 text-center">
                <p className="text-base leading-none font-extrabold tabular-nums">
                  {formatPesewas(tier.pricePesewas * qty)}
                </p>
                <p className="bg-cta px-2 py-0.5 text-xs leading-none font-bold text-cta-foreground tabular-nums">
                  × {qty}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex items-baseline justify-between gap-4 border-t border-border py-4">
        <p className="text-sm text-muted-foreground">
          {ticketCount} ticket{ticketCount === 1 ? "" : "s"}
        </p>
        <p className="text-xl font-extrabold tabular-nums [font-stretch:105%]">
          {formatPesewas(totalPesewas)}
        </p>
      </div>

      {!checkoutOpen ? (
        <p className="border-l-2 border-border pl-4 text-sm text-muted-foreground">
          Card and mobile money payments are being switched on. Once they are live you
          will pay here and get your tickets on WhatsApp and SMS straight away.
        </p>
      ) : (
        <div className="flex flex-col gap-4 border-t border-border pt-6">
          <div>
            <h3 className="text-lg font-bold [font-stretch:105%]">Your details</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your {ticketCount === 1 ? "ticket goes" : "tickets go"} to this number by
              WhatsApp and SMS.
            </p>
          </div>

          <Field id="name" label="Full name" autoComplete="name" />
          <Field
            id="phone"
            label="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="024 123 4567"
          />
          <Field
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            hint="A backup copy goes here in case the message does not reach your phone."
          />

          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          <PayButton total={totalPesewas} />

          <p className="text-center text-xs text-muted-foreground">
            Pay with mobile money or card. Your{" "}
            {ticketCount === 1 ? "ticket" : "tickets"} will be held for 10 minutes while
            you pay.
          </p>
        </div>
      )}
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  ...props
}: {
  id: string;
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        required
        {...props}
        className="mt-1.5 w-full border border-border bg-card px-3 py-3 text-base focus-visible:border-cta focus-visible:outline-none"
      />
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
