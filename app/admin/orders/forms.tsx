"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { RotateCwIcon, SendIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
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
  icon,
}: {
  label: string;
  pendingLabel: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  icon?: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : icon}
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
    <form action={action} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="orderId" value={orderId} />
      <Submit
        label="Resend tickets"
        pendingLabel="Queueing…"
        variant="outline"
        icon={<SendIcon data-icon="inline-start" />}
      />
      <Outcome state={state} />
    </form>
  );
}

export function RetryDeliveryForm({ deliveryId }: { deliveryId: string }) {
  const [state, action] = useActionState(retryDelivery, emptyOrderActionState);

  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="deliveryId" value={deliveryId} />
      <Submit
        label="Retry"
        pendingLabel="Queueing…"
        variant="outline"
        size="sm"
        icon={<RotateCwIcon data-icon="inline-start" />}
      />
      <Outcome state={state} />
    </form>
  );
}

/**
 * Void and refund both ask for a reason before they will run, now in a dialog.
 *
 * The reason is the only record of why a ticket stopped working, and the person asking
 * about it at the gate three weeks later deserves better than a blank field. They used
 * to open inline, pushing the page around mid-read; a dialog keeps the page still, and
 * Cancel takes focus so a stray Enter does nothing.
 */
export function VoidTicketForm({ ticketId, code }: { ticketId: string; code: string }) {
  const [state, action] = useActionState(voidTicket, emptyOrderActionState);
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>Void</AlertDialogTrigger>
      <AlertDialogContent initialFocus={cancelRef}>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="ticketId" value={ticketId} />
          <AlertDialogHeader>
            <AlertDialogTitle>Void {code}?</AlertDialogTitle>
            <AlertDialogDescription>
              The seat goes back on sale and this QR stops working at the gate. The rest of
              the order is untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Field>
            <FieldLabel htmlFor={`reason-${ticketId}`}>Reason</FieldLabel>
            <Input
              id={`reason-${ticketId}`}
              name="reason"
              required
              maxLength={200}
              placeholder="Duplicate purchase, chargeback, transferred…"
            />
          </Field>

          <Outcome state={state} />

          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef}>Keep ticket</AlertDialogCancel>
            <Submit label="Void ticket" pendingLabel="Voiding…" variant="destructive" />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
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
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" />}>Mark refunded</AlertDialogTrigger>
      <AlertDialogContent initialFocus={cancelRef}>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="orderId" value={orderId} />
          <AlertDialogHeader>
            <AlertDialogTitle>Record a refund?</AlertDialogTitle>
            <AlertDialogDescription>
              Voids {ticketCount === 1 ? "the ticket" : `all ${ticketCount} tickets`} on this
              order.{" "}
              <strong className="text-foreground">This does not move any money:</strong> issue
              the refund in the Paystack dashboard yourself.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Field>
            <FieldLabel htmlFor="refund-reason">Reason</FieldLabel>
            <Input
              id="refund-reason"
              name="reason"
              required
              maxLength={200}
              placeholder="Buyer cancelled, duplicate charge, event change…"
            />
          </Field>

          <Outcome state={state} />

          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef}>Cancel</AlertDialogCancel>
            <Submit label="Record refund" pendingLabel="Recording…" variant="destructive" />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
