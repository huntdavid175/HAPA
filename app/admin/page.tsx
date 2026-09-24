import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangleIcon,
  BanknoteIcon,
  DoorOpenIcon,
  ReceiptTextIcon,
  TicketIcon,
} from "lucide-react";

import { getEventStats } from "@/lib/admin/stats";
import { formatPesewas, formatTotals, formatEventDate, formatEventTime } from "@/lib/format";
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
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
            <CardDescription>How each ticket type is selling.</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/admin/event" />}>
                Edit
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {stats.tiers.map((tier) => {
              const pct = Math.round((tier.sold / tier.capacity) * 100);
              return (
                <div key={tier.id} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{tier.name}</span>
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {formatPesewas(tier.pricePesewas, tier.currency)} · {tier.sold}/{tier.capacity}
                      {tier.held > 0 ? ` · ${tier.held} held` : ""}
                    </span>
                  </div>
                  <Progress value={pct} aria-label={`${tier.name} sold`} />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent purchases</CardTitle>
            <CardDescription>The last few orders to come through.</CardDescription>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Tickets</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {order.buyerName}
                        </Link>
                        <div className="text-muted-foreground text-xs">
                          {order.buyerPhone}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{order.ticketCount}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPesewas(order.totalPesewas, order.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
