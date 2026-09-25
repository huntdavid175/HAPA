import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  AlertTriangleIcon,
  MailIcon,
  MessageCircleIcon,
  PhoneIcon,
  SmartphoneIcon,
} from "lucide-react";
import { cn } from "cn";

import { requireAdmin } from "@/lib/auth";
import { getOrderDetail } from "@/lib/admin/orders";
import { getEventStats } from "@/lib/admin/stats";
import { formatPesewas, formatRelativeTime, formatTimestamp } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CopyButton } from "../../share/copy-button";
import {
  ResendTicketsForm,
  RetryDeliveryForm,
  VoidTicketForm,
  RefundOrderForm,
} from "../forms";

export const metadata: Metadata = { title: "Order" };
export const dynamic = "force-dynamic";

const ORDER_STATUS: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-success/15 text-success" },
  pending: { label: "In checkout", className: "bg-warning/15 text-warning" },
  failed: { label: "Didn't finish", className: "bg-muted text-muted-foreground" },
  expired: { label: "Didn't finish", className: "bg-muted text-muted-foreground" },
};

const TICKET_STATUS = {
  issued: { label: "Valid", className: "bg-success/15 text-success" },
  checked_in: { label: "Checked in", className: "bg-highlight/15 text-highlight" },
  void: { label: "Void", className: "bg-muted text-muted-foreground line-through" },
};

const DELIVERY_STATUS: Record<string, { label: string; className: string }> = {
  queued: { label: "Queued", className: "bg-muted text-muted-foreground" },
  sending: { label: "Sending", className: "bg-warning/15 text-warning" },
  sent: { label: "Sent", className: "bg-success/15 text-success" },
  delivered: { label: "Delivered", className: "bg-success/15 text-success" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
};

const CHANNEL = {
  email: { label: "Email", icon: MailIcon },
  sms: { label: "SMS", icon: SmartphoneIcon },
  whatsapp: { label: "WhatsApp", icon: MessageCircleIcon },
};

const PAID_BY: Record<string, string> = {
  card: "card",
  mobile_money: "mobile money",
  bank: "bank",
  bank_transfer: "bank transfer",
  ussd: "USSD",
};

/**
 * One order, laid out like Shopify's: what was bought and what happened to it in the
 * wide column, money and the person in the narrow one, and the two things an organiser
 * does here (resend, refund) at the top right.
 */
export default async function OrderDetailPage({ params }: PageProps<"/admin/orders/[id]">) {
  // The layout gates /admin, but this page reads a named person's phone and email under
  // the secret key, so it re-establishes the role itself rather than inheriting it.
  await requireAdmin();

  const { id } = await params;
  const [order, stats] = await Promise.all([getOrderDetail(id), getEventStats()]);
  if (!order) notFound();

  const tz = stats?.timezone ?? "Africa/Accra";
  const liveTickets = order.tickets.filter((t) => t.status !== "void");
  const checkedIn = order.tickets.filter((t) => t.status === "checked_in").length;
  const refunded = order.tickets.some((t) => t.refundedAt);
  const status = ORDER_STATUS[order.status] ?? {
    label: order.status,
    className: "bg-muted text-muted-foreground",
  };
  const canAct = order.status === "paid" && liveTickets.length > 0;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">{order.buyerName}</h1>
            <Pill className={status.className}>{status.label}</Pill>
            {refunded ? <Pill className="bg-muted text-muted-foreground">Refunded</Pill> : null}
          </div>
          <p className="text-muted-foreground text-sm">
            Ordered {formatTimestamp(order.createdAt, tz)}
            <span className="hidden sm:inline">
              {" "}
              ({formatRelativeTime(order.createdAt, tz)})
            </span>
          </p>
        </div>

        {canAct ? (
          <div className="flex flex-wrap items-start gap-2">
            <ResendTicketsForm orderId={order.id} />
            <RefundOrderForm orderId={order.id} ticketCount={order.tickets.length} />
          </div>
        ) : null}
      </div>

      {order.needsRefund ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Owed a refund</AlertTitle>
          <AlertDescription>
            {order.refundReason ?? "This order was paid but could not be fully issued."}{" "}
            Refund it in the Paystack dashboard, then record it with Mark refunded.
          </AlertDescription>
        </Alert>
      ) : null}

      {refunded && !order.needsRefund ? (
        <Alert>
          <AlertTitle>Refund recorded</AlertTitle>
          <AlertDescription>{order.refundReason || "No reason was given."}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Tickets</CardTitle>
              <CardDescription>
                {order.tickets.length === 0
                  ? "None issued."
                  : `${order.tickets.length} issued${checkedIn ? `, ${checkedIn} checked in` : ""}. Voiding one puts its seat back on sale and stops its QR at the gate.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {order.tickets.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {order.status === "pending"
                    ? "The payment has not landed yet. Tickets are issued the moment it does."
                    : "This order never reached a paid state, so no tickets exist."}
                </p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {order.tickets.map((ticket) => {
                    const s = TICKET_STATUS[ticket.status];
                    return (
                      <li
                        key={ticket.id}
                        className={cn(
                          "flex flex-col gap-3 rounded-lg border p-4",
                          ticket.status === "void" && "bg-muted/40 border-dashed",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            {/* The code is what gets read aloud at the gate, so it leads. */}
                            <p
                              className={cn(
                                "font-mono text-lg font-semibold tracking-wide",
                                ticket.status === "void" && "text-muted-foreground line-through",
                              )}
                            >
                              {ticket.code}
                            </p>
                            <p className="text-muted-foreground truncate text-sm">
                              {ticket.tierName}
                            </p>
                          </div>
                          <Pill className={s.className.replace(" line-through", "")}>
                            {s.label}
                          </Pill>
                        </div>

                        <div className="flex min-h-8 items-center justify-between gap-3 border-t border-dashed pt-3">
                          <p className="text-muted-foreground text-xs">
                            {ticket.checkedInAt
                              ? `In at ${formatTimestamp(ticket.checkedInAt, tz)}`
                              : ticket.voidReason
                                ? ticket.voidReason
                                : "Not scanned yet"}
                          </p>
                          {ticket.status === "issued" ? (
                            <VoidTicketForm ticketId={ticket.id} code={ticket.code} />
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Messages</CardTitle>
              <CardDescription>Every ticket message for this order, newest first.</CardDescription>
            </CardHeader>
            <CardContent>
              {order.deliveries.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nothing has been sent for this order.
                </p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {order.deliveries.map((d) => {
                    const channel = CHANNEL[d.channel];
                    const ds = DELIVERY_STATUS[d.status] ?? DELIVERY_STATUS.queued;
                    return (
                      <li key={d.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                        <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full">
                          <channel.icon className="text-muted-foreground size-4" />
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                {channel.label}
                                <Pill className={ds.className}>{ds.label}</Pill>
                              </p>
                              <p className="text-muted-foreground text-xs break-all">
                                to {d.recipient}
                              </p>
                            </div>
                            <time
                              dateTime={d.lastAttemptAt ?? d.createdAt}
                              title={formatTimestamp(d.lastAttemptAt ?? d.createdAt, tz)}
                              className="text-muted-foreground text-xs"
                            >
                              {formatRelativeTime(d.lastAttemptAt ?? d.createdAt, tz)}
                            </time>
                          </div>

                          {d.error ? (
                            <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-xs leading-relaxed break-words">
                              {d.error}
                            </p>
                          ) : null}

                          {d.status === "failed" ? (
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-muted-foreground text-xs">
                                {d.exhausted
                                  ? `Tried ${d.attempts} times and stopped. It will not retry on its own.`
                                  : `Tried ${d.attempts} time${d.attempts === 1 ? "" : "s"}. Retrying automatically.`}
                              </p>
                              <RetryDeliveryForm deliveryId={d.id} />
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              <ul className="flex flex-col gap-2.5">
                {order.items.map((item, i) => (
                  <li key={i} className="flex items-start justify-between gap-4">
                    <span className="min-w-0">
                      <span className="block">{item.tierName}</span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {item.quantity} × {formatPesewas(item.unitPricePesewas, order.currency)}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {formatPesewas(item.unitPricePesewas * item.quantity, order.currency)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex items-baseline justify-between gap-4 border-t pt-3">
                <span className="font-medium">Total</span>
                <span className="text-base font-semibold tabular-nums">
                  {formatPesewas(order.totalPesewas, order.currency)}
                </span>
              </div>

              <dl className="text-muted-foreground flex flex-col gap-1.5 text-xs">
                {order.paidAt ? (
                  <div className="flex justify-between gap-4">
                    <dt>Paid</dt>
                    <dd className="text-right">
                      {formatTimestamp(order.paidAt, tz)}
                      {order.channel ? ` by ${PAID_BY[order.channel] ?? order.channel}` : ""}
                    </dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-4">
                  <dt>Paystack ref</dt>
                  <dd className="truncate font-mono">{order.reference}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Buyer</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p className="font-medium">{order.buyerName}</p>
              <a
                href={`tel:${order.buyerPhone}`}
                className="hover:text-foreground text-muted-foreground flex items-center gap-2.5 tabular-nums"
              >
                <PhoneIcon className="size-4 shrink-0" />
                {order.buyerPhone}
              </a>
              <a
                href={`mailto:${order.buyerEmail}`}
                className="hover:text-foreground text-muted-foreground flex items-center gap-2.5 break-all"
              >
                <MailIcon className="size-4 shrink-0" />
                {order.buyerEmail}
              </a>
              <div className="pt-1">
                <CopyButton value={order.buyerPhone} label="Copy phone" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs leading-tight font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}
