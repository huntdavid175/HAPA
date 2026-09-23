import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AlertTriangleIcon } from "lucide-react";

import { requireAdmin } from "@/lib/auth";
import { getOrderDetail } from "@/lib/admin/orders";
import { getEventStats } from "@/lib/admin/stats";
import { formatPesewas, formatTimestamp } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ResendTicketsForm,
  RetryDeliveryForm,
  VoidTicketForm,
  RefundOrderForm,
} from "../forms";

export const metadata: Metadata = { title: "Order" };
export const dynamic = "force-dynamic";

const TICKET_BADGE = {
  issued: { label: "Valid", variant: "default" as const },
  checked_in: { label: "Checked in", variant: "secondary" as const },
  void: { label: "Void", variant: "outline" as const },
};

export default async function OrderDetailPage({ params }: PageProps<"/admin/orders/[id]">) {
  // The layout gates /admin, but this page reads a named person's phone and email under
  // the secret key, so it re-establishes the role itself rather than inheriting it.
  await requireAdmin();

  const { id } = await params;
  const [order, stats] = await Promise.all([getOrderDetail(id), getEventStats()]);
  if (!order) notFound();

  const tz = stats?.timezone ?? "Africa/Accra";
  const liveTickets = order.tickets.filter((t) => t.status !== "void");
  const refunded = order.tickets.some((t) => t.refundedAt);

  return (
    <>
      <Link
        href="/admin/buyers"
        className="text-muted-foreground text-sm underline-offset-4 hover:underline"
      >
        ← All buyers
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{order.buyerName}</h1>
          <p className="text-muted-foreground text-sm">
            {order.buyerPhone} · {order.buyerEmail}
          </p>
          <p className="text-muted-foreground text-xs">
            Ref {order.reference} · placed {formatTimestamp(order.createdAt, tz)}
            {order.paidAt ? ` · paid ${formatTimestamp(order.paidAt, tz)}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={order.status === "paid" ? "default" : "secondary"}>
            {order.status}
          </Badge>
          {order.channel ? <Badge variant="outline">{order.channel}</Badge> : null}
          <span className="font-semibold tabular-nums">
            {formatPesewas(order.totalPesewas)}
          </span>
        </div>
      </div>

      {order.needsRefund ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Owed a refund</AlertTitle>
          <AlertDescription>
            {order.refundReason ?? "This order was paid but could not be fully issued."}{" "}
            Refund it in the Paystack dashboard, then record it below.
          </AlertDescription>
        </Alert>
      ) : null}

      {refunded ? (
        <Alert>
          <AlertTitle>Refund recorded</AlertTitle>
          <AlertDescription>
            {order.refundReason ? order.refundReason : "No reason was given."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Bought</CardTitle>
            <CardDescription>What this order was for.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between gap-4">
                <span>
                  {item.quantity} × {item.tierName}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {formatPesewas(item.unitPricePesewas * item.quantity)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {order.status === "paid" && liveTickets.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
              <CardDescription>
                Resending queues a fresh message; refunding voids the tickets.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-start gap-3">
              <ResendTicketsForm orderId={order.id} />
              <RefundOrderForm orderId={order.id} ticketCount={order.tickets.length} />
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Tickets{order.tickets.length > 0 ? ` (${order.tickets.length})` : ""}
          </CardTitle>
          <CardDescription>
            Voiding a ticket returns its seat to sale and stops the QR at the gate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {order.tickets.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No tickets were issued.{" "}
              {order.status === "pending"
                ? "The payment has not landed yet — only the webhook issues tickets."
                : "This order never reached a paid state."}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {order.tickets.map((ticket, i) => (
                <div key={ticket.id} className="flex flex-col gap-3">
                  {i > 0 ? <Separator /> : null}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono font-semibold">{ticket.code}</p>
                      <p className="text-muted-foreground text-sm">{ticket.tierName}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge variant={TICKET_BADGE[ticket.status].variant}>
                        {TICKET_BADGE[ticket.status].label}
                      </Badge>
                      {ticket.checkedInAt ? (
                        <span className="text-muted-foreground text-xs">
                          {formatTimestamp(ticket.checkedInAt, tz)}
                        </span>
                      ) : null}
                      {ticket.status === "issued" ? (
                        <VoidTicketForm ticketId={ticket.id} code={ticket.code} />
                      ) : null}
                    </div>
                  </div>

                  {ticket.voidReason ? (
                    <p className="text-muted-foreground text-sm">{ticket.voidReason}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
          <CardDescription>
            Every ticket message queued for this order, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {order.deliveries.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing has been queued for this order.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {order.deliveries.map((d, i) => (
                <div key={d.id} className="flex flex-col gap-3">
                  {i > 0 ? <Separator /> : null}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex flex-col gap-1">
                      <p className="text-sm font-medium">
                        {d.channel.toUpperCase()} → {d.recipient}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {d.status}
                        {d.attempts > 0
                          ? ` · ${d.attempts} attempt${d.attempts === 1 ? "" : "s"}`
                          : ""}
                        {" · "}
                        {formatTimestamp(d.lastAttemptAt ?? d.createdAt, tz)}
                      </p>
                      {d.error ? (
                        <p className="text-destructive text-sm break-words">{d.error}</p>
                      ) : null}
                      {d.exhausted ? (
                        <p className="text-muted-foreground text-xs">
                          Given up on after 5 tries — it will not retry on its own.
                        </p>
                      ) : null}
                    </div>
                    {d.status === "failed" ? (
                      <RetryDeliveryForm deliveryId={d.id} />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
