"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  saveEvent,
  saveTier,
  setEventStatus,
  deactivateTier,
  type ActionState,
} from "./actions";

const initial: ActionState = { error: null, ok: null };

function Submit({ label, pendingLabel }: { label: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
    >
      {pending ? (pendingLabel ?? "Saving…") : label}
    </button>
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

const field =
  "mt-1 w-full rounded-lg border border-border bg-card px-3 py-2.5 text-base";

export type EventFormValues = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  venue: string;
  coverImage: string;
  /** Pre-formatted for datetime-local, already in the event's timezone. */
  startsAtLocal: string;
  timezone: string;
};

export function EventForm({ event }: { event: EventFormValues }) {
  const [state, action] = useActionState(saveEvent, initial);

  return (
    <form action={action} className="space-y-4">
      {event.id ? <input type="hidden" name="id" value={event.id} /> : null}

      <div>
        <label htmlFor="name" className="block text-sm font-medium">Event name</label>
        <input id="name" name="name" defaultValue={event.name} required className={field} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="slug" className="block text-sm font-medium">URL slug</label>
          <input id="slug" name="slug" defaultValue={event.slug} required className={field} />
          <p className="mt-1 text-xs text-muted-foreground">
            Appears in the link you share: /e/<span className="font-mono">your-slug</span>.
            Avoid changing it once posters are printed.
          </p>
        </div>
        <div>
          <label htmlFor="venue" className="block text-sm font-medium">Venue</label>
          <input id="venue" name="venue" defaultValue={event.venue} className={field} />
        </div>
      </div>

      <div>
        <label htmlFor="coverImage" className="block text-sm font-medium">
          Cover image URL
        </label>
        <input
          id="coverImage"
          name="coverImage"
          type="url"
          inputMode="url"
          placeholder="https://…"
          defaultValue={event.coverImage}
          className={field}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          The banner at the top of the event page. Landscape works best — it is cropped to
          a wide band. Leave it empty and the page falls back to a gradient.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="startsAt" className="block text-sm font-medium">Starts</label>
          <input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            defaultValue={event.startsAtLocal}
            required
            className={field}
          />
        </div>
        <div>
          <label htmlFor="timezone" className="block text-sm font-medium">Timezone</label>
          <input id="timezone" name="timezone" defaultValue={event.timezone} className={field} />
          <p className="mt-1 text-xs text-muted-foreground">
            The time above is the time at the venue.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">Description</label>
        <textarea id="description" name="description" rows={4} defaultValue={event.description} className={field} />
      </div>

      <div className="flex items-center gap-3">
        <Submit label="Save event" />
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function StatusForm({ id, status }: { id: string; status: string }) {
  const [state, action] = useActionState(setEventStatus, initial);

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
    <div className="flex flex-wrap items-center gap-3">
      {next.map((option) => (
        <form key={option.value} action={action}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={option.value} />
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium"
          >
            {option.label}
          </button>
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
    <form action={action} className="space-y-3">
      <input type="hidden" name="eventId" value={eventId} />
      {tier?.id ? <input type="hidden" name="id" value={tier.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground">Name</label>
          <input name="name" defaultValue={tier?.name ?? ""} required className={field} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground">Price (GH₵)</label>
          <input
            name="priceGhs"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={tier?.priceGhs ?? ""}
            required
            className={field}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground">Capacity</label>
          <input
            name="capacity"
            type="number"
            step="1"
            min="1"
            defaultValue={tier?.capacity ?? ""}
            required
            className={field}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground">Description</label>
        <input name="description" defaultValue={tier?.description ?? ""} className={field} />
      </div>

      <div className="flex items-center gap-3">
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
      <button type="submit" className="text-sm text-muted-foreground underline hover:text-foreground">
        Remove from sale
      </button>
      <Feedback state={state} />
    </form>
  );
}
