"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { createBroadcast, drainOutbox, type BroadcastState } from "./actions";

const initial: BroadcastState = { error: null, ok: null };
const field = "mt-1 w-full rounded-lg border border-border bg-card px-3 py-2.5 text-base";

function Submit({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function Feedback({ state }: { state: BroadcastState }) {
  if (state.error)
    return <p role="alert" className="text-sm font-medium text-destructive">{state.error}</p>;
  if (state.ok)
    return <p role="status" className="text-sm font-medium text-success">{state.ok}</p>;
  return null;
}

export function ComposeForm({
  eventId,
  tiers,
}: {
  eventId: string;
  tiers: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(createBroadcast, initial);
  const [body, setBody] = useState("");
  const [whatsapp, setWhatsapp] = useState(false);

  // 160 GSM-7 characters per segment; each extra segment is charged separately.
  const segments = body.length === 0 ? 0 : Math.ceil(body.length / 160);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="eventId" value={eventId} />

      <div>
        <label htmlFor="body" className="block text-sm font-medium">Message</label>
        <textarea
          id="body"
          name="body"
          rows={5}
          maxLength={480}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Doors now open at 7pm, not 8pm. Same venue. See you there."
          className={field}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {body.length}/480 characters
          {segments > 0
            ? ` · ${segments} SMS segment${segments === 1 ? "" : "s"} per recipient`
            : ""}
          {segments > 1 ? " — each segment is billed separately" : ""}
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Send by</legend>
        <div className="mt-2 space-y-2">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="channels" value="sms" defaultChecked className="mt-1" />
            <span>
              <strong>SMS</strong>
              <span className="block text-xs text-muted-foreground">
                Any wording, sends immediately, no approval needed. Use this for anything
                unplanned.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="channels"
              value="whatsapp"
              checked={whatsapp}
              onChange={(e) => setWhatsapp(e.target.checked)}
              className="mt-1"
            />
            <span>
              <strong>WhatsApp</strong>
              <span className="block text-xs text-muted-foreground">
                Requires a template Meta approved in advance. Your wording above will not
                be sent as-is.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="channels" value="email" className="mt-1" />
            <span>
              <strong>Email</strong>
              <span className="block text-xs text-muted-foreground">
                Free-form, useful as a backup when a phone number bounces.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      {whatsapp ? (
        <div>
          <label htmlFor="whatsappTemplate" className="block text-sm font-medium">
            WhatsApp template name
          </label>
          <input id="whatsappTemplate" name="whatsappTemplate" className={field} />
          <p className="mt-1 text-xs text-muted-foreground">
            The exact name of an approved template, e.g. <code>event_time_change</code>.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tierId" className="block text-sm font-medium">Ticket type</label>
          <select id="tierId" name="tierId" defaultValue="" className={field}>
            <option value="">Everyone who bought</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>Only {t.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="checkedIn" className="block text-sm font-medium">Check-in status</label>
          <select id="checkedIn" name="checkedIn" defaultValue="any" className={field}>
            <option value="any">Everyone</option>
            <option value="no">Not arrived yet</option>
            <option value="yes">Already checked in</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Queue message" pending="Queueing…" />
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function DrainButton() {
  const [state, action] = useActionState(drainOutbox, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        className="rounded-lg border border-border px-3 py-2 text-sm font-medium"
      >
        Send queued now
      </button>
      <Feedback state={state} />
    </form>
  );
}
