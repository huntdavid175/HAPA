"use client";

import { useRef, useState, useTransition } from "react";
import { CheckIcon, XIcon } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { formatPesewas } from "@/lib/format";
import {
  TICKET_REQUEST_LIMITS,
  validateTicketRequest,
  type TicketRequestErrors as Errors,
  type TicketRequestFields as Fields,
} from "@/lib/ticket-request";
import { submitTicketRequest } from "@/app/requests/actions";
import { useCart, type CartTier } from "./cart";
import { HeardAboutField } from "./heard-about-field";

// Form order: the first field with an error is the one that gets focus.
const ORDER: (keyof Fields)[] = [
  "name",
  "organisation",
  "email",
  "phone",
  "quantity",
  "message",
  "heardAbout",
  "heardAboutOther",
];

/**
 * A request for a tier booked through the organiser (the dollar table), in the same
 * drawer the cart uses — up from the bottom on a phone, in from the right on a desktop —
 * so it reads as the same place to buy, with a different last step.
 *
 * It opens on a paper slip, the stub the registration pass is built from: what is being
 * asked for, at what price, and that nothing is charged. Sending stamps the slip. The
 * request is saved and emailed to the organiser (app/requests/actions.ts).
 *
 * `theme-night` is repeated on the content because the drawer renders through a portal.
 */
export function RequestDrawer() {
  const { requestTier, closeRequest } = useCart();
  const isMobile = useIsMobile();
  // Kept through the closing animation, so the slip does not blank out mid-slide.
  const [shown, setShown] = useState<CartTier | null>(null);
  if (requestTier && requestTier !== shown) setShown(requestTier);

  return (
    <Drawer
      open={requestTier !== null}
      onOpenChange={(open) => {
        if (!open) closeRequest();
      }}
      swipeDirection={isMobile ? "down" : "right"}
      showSwipeHandle
    >
      <DrawerContent className="theme-night bg-background text-foreground data-[swipe-axis=x]:sm:[--drawer-content-width:30rem]">
        <DrawerHeader className="relative">
          <DrawerTitle>Request to book</DrawerTitle>
          <DrawerDescription className="sr-only">
            Send your details to the organiser. Nothing is charged.
          </DrawerDescription>
          <DrawerClose
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-2 right-4 flex size-9 items-center justify-center rounded-full transition focus-visible:ring-2 focus-visible:outline-none"
          >
            <XIcon className="size-5" />
          </DrawerClose>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-6 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {shown ? <RequestForm key={shown.id} tier={shown} onDone={closeRequest} /> : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function RequestForm({ tier, onDone }: { tier: CartTier; onDone: () => void }) {
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<Fields | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const slipRef = useRef<HTMLDivElement>(null);

  function read(form: HTMLFormElement): Fields {
    const data = new FormData(form);
    const get = (key: keyof Fields) => String(data.get(key) ?? "");
    return {
      name: get("name"),
      organisation: get("organisation"),
      email: get("email"),
      phone: get("phone"),
      quantity: get("quantity"),
      message: get("message"),
      heardAbout: get("heardAbout"),
      heardAboutOther: get("heardAboutOther"),
    };
  }

  function focusFirst(found: Errors) {
    const first = ORDER.find((key) => found[key]);
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    return Boolean(first);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const fields = read(event.currentTarget);
    const found = validateTicketRequest(fields);
    setErrors(found);
    setFormError(null);
    if (focusFirst(found)) return;

    startTransition(async () => {
      let result;
      try {
        result = await submitTicketRequest({ tierId: tier.id, ...fields });
      } catch {
        setFormError("Your request was not sent. Check your connection and try again.");
        return;
      }
      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors) {
          setErrors(result.fieldErrors);
          focusFirst(result.fieldErrors);
        }
        return;
      }
      setSent(fields);
      slipRef.current?.scrollIntoView({ block: "start" });
    });
  }

  const price = formatPesewas(tier.pricePesewas, tier.currency);

  return (
    <div className="flex flex-col gap-7">
      {/* ---- The slip ----------------------------------------------------------------- */}
      <div ref={slipRef} className="theme-paper relative scroll-mt-4 overflow-hidden rounded-[1.25rem] bg-card text-card-foreground">
        <div className="flex">
          <div className="min-w-0 flex-1 px-5 pt-5 pb-5">
            <p className="text-sm font-semibold text-muted-foreground">Booked through the organiser</p>
            <p className="mt-1 text-[1.375rem] leading-tight font-extrabold tracking-[-0.02em] break-words [font-stretch:105%]">
              {tier.name}
            </p>
            <p className="mt-3 text-base font-bold tabular-nums">
              {price} <span className="text-sm font-semibold text-muted-foreground">each</span>
            </p>

            {/* Stamped on a line of its own: floated over the slip it covered the price on
                a phone. */}
            {sent ? (
              <span
                role="status"
                className="reg-stamp mt-4 inline-flex items-center gap-1.5 rounded-lg border-[3px] border-cta px-2.5 py-1 text-[0.95rem] font-extrabold tracking-[-0.01em] text-cta"
              >
                <CheckIcon className="size-4" strokeWidth={3.5} />
                Request sent
              </span>
            ) : null}
          </div>
          <span
            aria-hidden
            className="flex w-10 shrink-0 items-center justify-center bg-cta text-cta-foreground"
          >
            <span className="rotate-180 text-sm font-extrabold whitespace-nowrap [writing-mode:vertical-rl]">
              Request
            </span>
          </span>
        </div>
        <div className="border-t-2 border-dashed border-border bg-muted px-5 py-4 text-sm leading-snug text-foreground">
          {sent ? (
            <>
              {sent.quantity} × {tier.name} for {sent.organisation.trim() || sent.name.trim()}.
              The organiser will contact you at{" "}
              <strong className="font-semibold break-all">{sent.email.trim()}</strong>.
            </>
          ) : (
            "No payment now. Send your details and the organiser will contact you to arrange it."
          )}
        </div>
      </div>

      {sent ? (
        <button
          type="button"
          onClick={onDone}
          className="w-full border border-border px-6 py-3.5 text-sm font-bold transition hover:bg-card focus-visible:ring-2 focus-visible:ring-cta focus-visible:outline-none"
        >
          Done
        </button>
      ) : (
        /* ---- The form ------------------------------------------------------------------ */
        <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field name="name" label="Full name" autoComplete="name" error={errors.name} />
          <Field
            name="organisation"
            label="Organisation (optional)"
            autoComplete="organization"
            maxLength={TICKET_REQUEST_LIMITS.organisation}
            error={errors.organisation}
          />
          <Field
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email}
          />
          <Field
            name="phone"
            label="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="024 123 4567"
            hint="Outside Ghana? Start with + and your country code."
            error={errors.phone}
          />

          <div>
            <label htmlFor="req-quantity" className="block text-[0.8125rem] font-medium">
              How many?
            </label>
            <select
              id="req-quantity"
              name="quantity"
              defaultValue="1"
              className="mt-1.5 w-full border border-border bg-card px-3 py-3 text-base focus-visible:border-cta focus-visible:outline-none"
            >
              {Array.from({ length: TICKET_REQUEST_LIMITS.maxQuantity }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="req-message" className="block text-[0.8125rem] font-medium">
              Anything the organiser should know? (optional)
            </label>
            <textarea
              id="req-message"
              name="message"
              rows={3}
              maxLength={TICKET_REQUEST_LIMITS.message}
              aria-invalid={errors.message ? true : undefined}
              className="mt-1.5 w-full resize-y border border-border bg-card px-3 py-3 text-base focus-visible:border-cta focus-visible:outline-none"
            />
            {errors.message ? <ErrorText id="req-message-error">{errors.message}</ErrorText> : null}
          </div>

          <HeardAboutField error={errors.heardAbout} />

          {formError ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {formError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 w-full bg-cta px-6 py-3.5 text-sm font-bold text-cta-foreground transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-cta focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send request"}
          </button>
          <p className="text-center text-xs text-muted-foreground">Nothing is charged.</p>
        </form>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  hint,
  error,
  ...props
}: {
  name: keyof Fields;
  label: string;
  hint?: string;
  error?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  const id = `req-${name}`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-[0.8125rem] font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
        className="mt-1.5 w-full border border-border bg-card px-3 py-3 text-base focus-visible:border-cta focus-visible:outline-none aria-invalid:border-destructive"
      />
      {error ? (
        <ErrorText id={`${id}-error`}>{error}</ErrorText>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[0.8125rem] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function ErrorText({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-[0.8125rem] font-medium text-destructive">
      {children}
    </p>
  );
}
