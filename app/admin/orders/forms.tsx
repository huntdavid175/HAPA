"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  resendTickets,
  retryDelivery,
  voidTicket,
  markOrderRefunded,
  type OrderActionState,
} from "./actions";

// Lives here, not in actions.ts: a "use server" file may export only async functions,
// and one exported object there stops Next loading the file at all — every action in
// it (Retry, Resend, Void, Mark refunded) then fails with a 500.
const emptyOrderActionState: OrderActionState = { error: null, notice: null };

function Submit({
  label,
  pendingLabel,
  variant = "default",
  size,
}: {
  label: string;
  pendingLabel: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? pendingLabel : label}
    </Button>
  );
}

function Outcome({ state }: { state: OrderActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-destructive text-sm font-medium">
        {state.error}
      </p>
    );
  }
  if (state.notice) {
    return (
      <p role="status" className="text-success text-sm">
        {state.notice}
      </p>
    );
  }
  return null;
}

export function ResendTicketsForm({ orderId }: { orderId: string }) {
  const [state, action] = useActionState(resendTickets, emptyOrderActionState);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <Submit label="Resend tickets" pendingLabel="Queueing…" />
      <Outcome state={state} />
    </form>
  );
}

export function RetryDeliveryForm({ deliveryId }: { deliveryId: string }) {
  const [state, action] = useActionState(retryDelivery, emptyOrderActionState);

  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="deliveryId" value={deliveryId} />
      <Submit label="Retry" pendingLabel="Queueing…" variant="outline" size="sm" />
      <Outcome state={state} />
    </form>
  );
}

/**
 * Void and refund both ask for a reason before they will run.
 *
 * The reason is the only record of why a ticket stopped working, and the person asking
 * about it at the gate three weeks later deserves better than a blank field. Hiding the
 * form behind a toggle also means neither destructive action is one stray tap away.
 */
export function VoidTicketForm({ ticketId, code }: { ticketId: string; code: string }) {
  const [state, action] = useActionState(voidTicket, emptyOrderActionState);
  const [open, setOpen] = useState(false);

  if (!open && !state.notice && !state.error) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Void
      </Button>
    );
  }

  return (
    <form action={action} className="w-full">
      <input type="hidden" name="ticketId" value={ticketId} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`reason-${ticketId}`}>
            Why is {code} being voided?
          </FieldLabel>
          <Input
            id={`reason-${ticketId}`}
            name="reason"
            required
            maxLength={200}
            placeholder="Duplicate purchase, chargeback, transferred…"
          />
          <FieldDescription>
            The seat goes back on sale and the QR stops working at the gate.
          </FieldDescription>
        </Field>

        <div className="flex items-center gap-2">
          <Submit label="Void this ticket" pendingLabel="Voiding…" variant="destructive" />
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>

        <Outcome state={state} />
      </FieldGroup>
    </form>
  );
}

export function RefundOrderForm({
  orderId,
  ticketCount,
}: {
  orderId: string;
  ticketCount: number;
}) {
  const [state, action] = useActionState(markOrderRefunded, emptyOrderActionState);
  const [open, setOpen] = useState(false);

  if (!open && !state.notice && !state.error) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Mark refunded
      </Button>
    );
  }

  return (
    <form action={action} className="w-full">
      <input type="hidden" name="orderId" value={orderId} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="refund-reason">Why was this refunded?</FieldLabel>
          <Input
            id="refund-reason"
            name="reason"
            required
            maxLength={200}
            placeholder="Buyer cancelled, duplicate charge, event change…"
          />
          <FieldDescription>
            Voids {ticketCount === 1 ? "the ticket" : `all ${ticketCount} tickets`} on this
            order. <strong>This does not move any money</strong> — issue the refund in the
            Paystack dashboard yourself.
          </FieldDescription>
        </Field>

        <div className="flex items-center gap-2">
          <Submit label="Record the refund" pendingLabel="Recording…" variant="destructive" />
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>

        <Outcome state={state} />
      </FieldGroup>
    </form>
  );
}
