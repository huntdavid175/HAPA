import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangleIcon,
  BanknoteIcon,
  DoorOpenIcon,
  ReceiptTextIcon,
  TicketIcon,
} from "lucide-react";

import { getEventStats, type TierStat } from "@/lib/admin/stats";
import {
  formatPesewas,
  formatTotals,
  formatEventDate,
  formatEventTime,
  formatRelativeTime,
  formatTimestamp,
} from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const stats = await getEventStats();

  if (!stats) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TicketIcon />
          </EmptyMedia>
          <EmptyTitle>No live event</EmptyTitle>
          <EmptyDescription>
            Nothing is published yet, so there is nothing to sell or report on.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} render={<Link href="/admin/event" />}>Set up your event</Button>
        </EmptyContent>
      </Empty>
    );
  }

  const needsAttention = stats.failedDeliveries > 0 || stats.unprocessedWebhooks > 0;

  // Capacity still on offer. An off-sale tier's unsold seats are not seats anyone can buy.
  const totalCapacity = stats.tiers.reduce(
    (sum, t) => sum + (t.active ? t.capacity : t.sold),
    0,
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {stats.eventName}
          </h1>
          <p className="text-muted-foreground text-sm">
            {formatEventDate(stats.startsAt, stats.timezone)} ·{" "}
            {formatEventTime(stats.startsAt, stats.timezone)}
          </p>
        </div>

        <Button variant="outline" nativeButton={false} render={<Link href={`/e/${stats.eventSlug}`} />}>
          View public page
        </Button>
      </div>

      {/* Anything needing a human goes above the numbers. */}
      {needsAttention ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>
            <ul className="flex list-disc flex-col gap-1 pl-4">
              {stats.failedDeliveries > 0 ? (
                <li>
                  <Link href="/admin/failures" className="underline underline-offset-4">
                    {stats.failedDeliveries} ticket message
                    {stats.failedDeliveries === 1 ? "" : "s"} failed to send
                  </Link>
                </li>
              ) : null}
              {stats.unprocessedWebhooks > 0 ? (
                <li>
                  {stats.unprocessedWebhooks} payment webhook
                  {stats.unprocessedWebhooks === 1 ? "" : "s"} not processed
                </li>
              ) : null}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tickets sold" value={String(stats.ticketsSold)} icon={TicketIcon} />
        <Stat
          label="Revenue"
          value={formatTotals(stats.revenue)}
          icon={BanknoteIcon}
        />
        <Stat label="Orders" value={String(stats.paidOrders)} icon={ReceiptTextIcon} />
        <Stat
          label="Checked in"
          value={String(stats.checkedIn)}
          icon={DoorOpenIcon}
          hint={
            stats.ticketsSold > 0
              ? `${Math.round((stats.checkedIn / stats.ticketsSold) * 100)}% of tickets sold`
              : undefined
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tiers</CardTitle>
            <CardDescription>
              {totalCapacity > 0
                ? `${stats.ticketsSold.toLocaleString()} of ${totalCapacity.toLocaleString()} tickets sold.`
                : "How each ticket type is selling."}
            </CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/admin/event" />}>
                Edit
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-5">
              {stats.tiers.map((tier) => (
                <TierRow key={tier.id} tier={tier} />
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent purchases</CardTitle>
            <CardDescription>
              {stats.paidOrders > stats.recentOrders.length
                ? `The latest ${stats.recentOrders.length} of ${stats.paidOrders} orders.`
                : "Every order so far, newest first."}
            </CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/admin/buyers" />}>
                All buyers
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {stats.recentOrders.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No tickets sold yet. Purchases appear here as they happen.
              </p>
            ) : (
              // Capped at five so the card sits level with Tiers beside it; the whole list
              // is one click away in Buyers. Each row answers "who, how much, how long
              // ago" — the phone number lives on the order page, not here.
              <ul className="-mx-2 flex flex-col">
                {stats.recentOrders.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="hover:bg-muted focus-visible:ring-ring/50 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors outline-none focus-visible:ring-[3px]"
                    >
                      <Avatar>
                        <AvatarFallback className="text-xs font-medium">
                          {initials(order.buyerName)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{order.buyerName}</p>
                        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                          <TicketIcon aria-hidden className="size-3.5" />
                          <span className="truncate">
                            {order.ticketCount} ticket{order.ticketCount === 1 ? "" : "s"}
                            {order.channel ? ` by ${channelLabel(order.channel)}` : ""}
                          </span>
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium tabular-nums">
                          {formatPesewas(order.totalPesewas, order.currency)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          <time
                            dateTime={order.createdAt}
                            title={formatTimestamp(order.createdAt, stats.timezone)}
                          >
                            {formatRelativeTime(order.createdAt, stats.timezone)}
                          </time>
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        <CardAction>
          <span className="text-muted-foreground [&_svg]:size-4">
            <Icon />
          </span>
        </CardAction>
      </CardHeader>
      {hint ? (
        <CardContent>
          <p className="text-muted-foreground text-xs">{hint}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

/**
 * One tier: what it has earned, what it costs, and how full it is.
 *
 * The bar is the one piece of colour on the card, and it carries two numbers: sold in
 * solid colour, held (buyers mid-payment right now) as a faint tint beyond it. A tier
 * that has sold anything always shows at least a sliver — 3 of 500 is 0.6%, which at
 * full precision draws nothing and reads as "no sales".
 */
function TierRow({ tier }: { tier: TierStat }) {
  const soldPct = tier.capacity ? (tier.sold / tier.capacity) * 100 : 0;
  const heldPct = tier.capacity ? (tier.held / tier.capacity) * 100 : 0;
  const soldWidth = tier.sold > 0 ? Math.max(soldPct, 1.5) : 0;
  const heldWidth = tier.held > 0 ? Math.max(heldPct, 1.5) : 0;
  const soldOut = tier.active && tier.available === 0;

  return (
    <li className={tier.active ? undefined : "opacity-60"}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span className="break-words">{tier.name}</span>
            {soldOut ? <Badge variant="secondary">Sold out</Badge> : null}
            {!tier.active ? <Badge variant="outline">Off sale</Badge> : null}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
            {formatPesewas(tier.pricePesewas, tier.currency)} each
          </p>
        </div>
        <div className="shrink-0 text-right">
          {tier.revenue.length ? (
            <p className="text-sm font-medium tabular-nums">{formatTotals(tier.revenue)}</p>
          ) : (
            <p className="text-muted-foreground text-sm">No sales yet</p>
          )}
          <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
            {tier.sold.toLocaleString()} of {tier.capacity.toLocaleString()} sold
          </p>
        </div>
      </div>

      <div
        role="progressbar"
        aria-label={`${tier.name}: ${tier.sold} of ${tier.capacity} sold${tier.held ? `, ${tier.held} in checkout` : ""}`}
        aria-valuemin={0}
        aria-valuemax={tier.capacity}
        aria-valuenow={tier.sold}
        className="bg-muted mt-2.5 flex h-1.5 overflow-hidden rounded-full"
      >
        <div className="bg-primary h-full" style={{ width: `${soldWidth}%` }} />
        <div className="bg-primary/30 h-full" style={{ width: `${heldWidth}%` }} />
      </div>

      {tier.held > 0 ? (
        <p className="text-muted-foreground mt-1.5 text-xs tabular-nums">
          {tier.held} in checkout right now
        </p>
      ) : null}
    </li>
  );
}

/** "Jennifer Jacks" → "JJ", "Dzifa" → "DZ". Two letters, so every avatar is one width. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Paystack's channel names, as a buyer would say them. */
function channelLabel(channel: string): string {
  const labels: Record<string, string> = {
    mobile_money: "mobile money",
    card: "card",
    bank: "bank",
    bank_transfer: "bank transfer",
    ussd: "USSD",
    qr: "QR",
  };
  return labels[channel] ?? channel.replace(/_/g, " ");
}
