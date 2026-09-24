"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CURRENCIES,
  CURRENCY_LABELS,
  CURRENCY_SYMBOLS,
  type Currency,
} from "@/lib/currency";
import { ScheduleFields } from "./schedule-fields";
import { DescriptionEditor } from "./description-editor";
import {
  saveEvent,
  saveTier,
  setEventStatus,
  deactivateTier,
  type ActionState,
} from "./actions";

const initial: ActionState = { error: null, ok: null };

function Submit({
  label,
  pendingLabel,
  variant,
  size,
}: {
  label: string;
  pendingLabel?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} size={size}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? (pendingLabel ?? "Saving…") : label}
    </Button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm font-medium text-destructive">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="text-sm font-medium text-success">
        {state.ok}
      </p>
    );
  }
  return null;
}

export type EventFormValues = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  venue: string;
  coverImage: string;
  /** Pre-formatted as YYYY-MM-DDTHH:mm, already in the event's timezone. */
  startsAtLocal: string;
  /** Empty when the organiser has not published an end time. */
  endsAtLocal: string;
  timezone: string;
};

export function EventForm({ event }: { event: EventFormValues }) {
  const [state, action] = useActionState(saveEvent, initial);

  return (
    <form action={action}>
      {event.id ? <input type="hidden" name="id" value={event.id} /> : null}

      <FieldGroup>
        <FieldSet>
          <FieldLegend>Details</FieldLegend>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Event name</FieldLabel>
              <Input id="name" name="name" defaultValue={event.name} required />
            </Field>

            <div className="grid gap-6 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="slug">URL slug</FieldLabel>
                <Input id="slug" name="slug" defaultValue={event.slug} required />
                <FieldDescription>
                  The link you share: /e/<span className="font-mono">your-slug</span>.
                  Avoid changing it once posters are printed.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="venue">Venue</FieldLabel>
                <Input id="venue" name="venue" defaultValue={event.venue} />
              </Field>
            </div>

            <Field>
              <FieldLabel>Description</FieldLabel>
              <DescriptionEditor name="description" defaultValue={event.description} />
              <FieldDescription>
                Headings, lists and links are kept. Everything else is stripped before it
                is saved.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="coverImage">Cover image URL</FieldLabel>
              <Input
                id="coverImage"
                name="coverImage"
                type="url"
                inputMode="url"
                placeholder="https://…"
                defaultValue={event.coverImage}
              />
              <FieldDescription>
                The poster at the top of the event page. It is shown whole, so artwork
                with the name and dates on it works well.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Schedule</FieldLegend>
          <ScheduleFields
            defaultStartsAtLocal={event.startsAtLocal}
            defaultEndsAtLocal={event.endsAtLocal}
            defaultTimezone={event.timezone}
          />
        </FieldSet>

        <Field orientation="horizontal">
          <Submit label="Save event" />
          <Feedback state={state} />
        </Field>
      </FieldGroup>
    </form>
  );
}

export function StatusForm({ id, status }: { id: string; status: string }) {
  const [state, action] = useActionState(setEventStatus, initial);

  // Only the transitions that make sense from here. "Publish" on an already-live event
  // is not a button anyone needs, and offering it invites a pointless round trip.
  const next =
    status === "published"
      ? [
          { value: "sales_closed", label: "Close sales" },
          { value: "draft", label: "Unpublish" },
        ]
      : status === "sales_closed"
        ? [
            { value: "published", label: "Reopen sales" },
            { value: "draft", label: "Unpublish" },
          ]
        : [{ value: "published", label: "Publish" }];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {next.map((option) => (
        <form key={option.value} action={action}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={option.value} />
          <Submit
            label={option.label}
            pendingLabel="Updating…"
            variant={option.value === "published" ? "default" : "outline"}
            size="sm"
          />
        </form>
      ))}
      <Feedback state={state} />
    </div>
  );
}

export type TierFormValues = {
  id?: string;
  name: string;
  description: string;
  /** One benefit per line, which is how the textarea presents them. */
  benefits: string;
  highlight: boolean;
  badge: string;
  currency: Currency;
  /** In major units of `currency`, as typed: "350.00". */
  priceGhs: string;
  capacity: string;
};

export function TierForm({
  eventId,
  tier,
  onSaved,
}: {
  eventId: string;
  tier?: TierFormValues;
  /** Called after a successful save, so the sheet holding the form can close. */
  onSaved?: () => void;
}) {
  const [state, action] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await saveTier(prev, formData);
    if (result.ok) onSaved?.();
    return result;
  }, initial);
  const key = tier?.id ?? "new";
  const [currency, setCurrency] = useState<Currency>(tier?.currency ?? "GHS");

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="eventId" value={eventId} />
      {tier?.id ? <input type="hidden" name="id" value={tier.id} /> : null}

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`name-${key}`}>Name</FieldLabel>
            <Input id={`name-${key}`} name="name" defaultValue={tier?.name ?? ""} required />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor={`currency-${key}`}>Currency</FieldLabel>
              <Select
                name="currency"
                value={currency}
                onValueChange={(v) => v && setCurrency(v as Currency)}
                items={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_LABELS[c] }))}
              >
                <SelectTrigger id={`currency-${key}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CURRENCY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor={`price-${key}`}>
                Price ({CURRENCY_SYMBOLS[currency]})
              </FieldLabel>
              <Input
                id={`price-${key}`}
                name="priceGhs"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                defaultValue={tier?.priceGhs ?? ""}
                required
              />
            </Field>
          </div>

          {currency === "USD" ? (
            <p className="-mt-3 text-sm text-muted-foreground">
              Dollar tickets are paid by card only, since mobile money is cedis only. Paystack
              has to enable USD on your account before these can be bought. A buyer&rsquo;s cart
              holds one currency at a time.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor={`cap-${key}`}>Capacity</FieldLabel>
              <Input
                id={`cap-${key}`}
                name="capacity"
                type="number"
                step="1"
                min="1"
                inputMode="numeric"
                defaultValue={tier?.capacity ?? ""}
                required
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor={`desc-${key}`}>Description</FieldLabel>
            <Input
              id={`desc-${key}`}
              name="description"
              defaultValue={tier?.description ?? ""}
              placeholder="One line — what this ticket is"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={`benefits-${key}`}>What you get</FieldLabel>
            <Textarea
              id={`benefits-${key}`}
              name="benefits"
              rows={5}
              defaultValue={tier?.benefits ?? ""}
              placeholder={"All three days\nReserved seating\nWelcome drink"}
            />
            <FieldDescription>
              One per line, up to 8. These are what a buyer compares between tiers, so keep
              them short and answer the same question in each one.
            </FieldDescription>
          </Field>

          <Field orientation="horizontal">
            <Checkbox
              id={`highlight-${key}`}
              name="highlight"
              defaultChecked={tier?.highlight ?? false}
            />
            <FieldLabel htmlFor={`highlight-${key}`} className="font-normal">
              Make this tier stand out in the pricing cards
            </FieldLabel>
          </Field>

          <Field>
            <FieldLabel htmlFor={`badge-${key}`}>
              Badge <span className="text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input
              id={`badge-${key}`}
              name="badge"
              maxLength={24}
              placeholder="Most popular"
              defaultValue={tier?.badge ?? ""}
            />
            <FieldDescription>
              Shown on the highlighted card. Your words, so only claim what is true — leave
              it blank to highlight the card without saying anything.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t p-4">
        <Submit label={tier?.id ? "Save tier" : "Add tier"} />
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function DeactivateTierButton({ id }: { id: string }) {
  const [state, action] = useActionState(deactivateTier, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Submit label="Remove from sale" pendingLabel="Removing…" variant="ghost" size="sm" />
      <Feedback state={state} />
    </form>
  );
}
