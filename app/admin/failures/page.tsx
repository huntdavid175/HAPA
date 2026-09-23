import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2Icon } from "lucide-react";

import { requireAdmin } from "@/lib/auth";
import { getFailedDeliveries } from "@/lib/admin/orders";
import { getEventStats } from "@/lib/admin/stats";
import { formatTimestamp } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RetryDeliveryForm } from "../orders/forms";

export const metadata: Metadata = { title: "Failed messages" };
export const dynamic = "force-dynamic";

export default async function FailuresPage() {
  await requireAdmin();

  const [failures, stats] = await Promise.all([getFailedDeliveries(), getEventStats()]);
  const tz = stats?.timezone ?? "Africa/Accra";

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Failed messages</h1>
        <p className="text-muted-foreground text-sm">
          Ticket deliveries are listed first — a buyer with no ticket gets turned away at
          the gate, which matters more than a missed announcement.
        </p>
      </div>

      {failures.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCircle2Icon />
            </EmptyMedia>
            <EmptyTitle>Outbox is clean</EmptyTitle>
            <EmptyDescription>
              Nothing has failed to send. Anything that does will show up here with a way
              to retry it.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead className="text-right">Retry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failures.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <div className="font-medium">
                        {f.orderId ? (
                          <Link
                            href={`/admin/orders/${f.orderId}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {f.buyerName ?? "Ticket"}
                          </Link>
                        ) : (
                          "Broadcast"
                        )}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {f.channel.toUpperCase()} → {f.recipient}
                      </div>
                    </TableCell>

                    <TableCell className="text-muted-foreground max-w-xs">
                      <span className="break-words">{f.error ?? "No error recorded"}</span>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <span className="tabular-nums">{f.attempts}</span>
                        {f.exhausted ? (
                          <Badge variant="outline">Given up</Badge>
                        ) : null}
                        {f.lastAttemptAt ? (
                          <span className="text-muted-foreground text-xs">
                            {formatTimestamp(f.lastAttemptAt, tz)}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>

                    <TableCell className="text-right">
                      <RetryDeliveryForm deliveryId={f.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
