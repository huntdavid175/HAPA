"use client";

import { useActionState } from "react";
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
  priceGhs: string;
  capacity: string;
};

export function TierForm({
  eventId,
  tier,
}: {
  eventId: string;
  tier?: TierFormValues;
}) {
  const [state, action] = useActionState(saveTier, initial);

  return (
    <form action={action}>
      <input type="hidden" name="eventId" value={eventId} />
      {tier?.id ? <input type="hidden" name="id" value={tier.id} /> : null}

      <FieldGroup>
        <div className="grid gap-6 sm:grid-cols-4">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={`name-${tier?.id ?? "new"}`}>Name</FieldLabel>
            <Input
              id={`name-${tier?.id ?? "new"}`}
              name="name"
              defaultValue={tier?.name ?? ""}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={`price-${tier?.id ?? "new"}`}>Price (GHâµ)</FieldLabel>
            <Input
              id={`price-${tier?.id ?? "new"}`}
              name="priceGhs"
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              defaultValue={tier?.priceGhs ?? ""}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={`cap-${tier?.id ?? "new"}`}>Capacity</FieldLabel>
            <Input
              id={`cap-${tier?.id ?? "new"}`}
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
          <FieldLabel htmlFor={`desc-${tier?.id ?? "new"}`}>Description</FieldLabel>
          <Input
            id={`desc-${tier?.id ?? "new"}`}
            name="description"
            defaultValue={tier?.description ?? ""}
            placeholder="One line — what this ticket is"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`benefits-${tier?.id ?? "new"}`}>
            What you get
          </FieldLabel>
          <Textarea
            id={`benefits-${tier?.id ?? "new"}`}
            name="benefits"
            rows={4}
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
            id={`highlight-${tier?.id ?? "new"}`}
            name="highlight"
            defaultChecked={tier?.highlight ?? false}
          />
          <FieldLabel
            htmlFor={`highlight-${tier?.id ?? "new"}`}
            className="font-normal"
          >
            Make this tier stand out in the pricing cards
          </FieldLabel>
        </Field>

        <Field>
          <FieldLabel htmlFor={`badge-${tier?.id ?? "new"}`}>
            Badge <span className="text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input
            id={`badge-${tier?.id ?? "new"}`}
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

        <Field orientation="horizontal">
          <Submit label={tier?.id ? "Save tier" : "Add tier"} size="sm" />
          <Feedback state={state} />
        </Field>
      </FieldGroup>
    </form>
  );
}

export function DeactivateTierButton({ id }: { id: string }) {
  const [state, action] = useActionState(deactivateTier, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Submit label="Remove from sale" pendingLabel="Removingâ¦" variant="ghost" size="sm" />
      <Feedback state={state} />
    </form>
  );
}
