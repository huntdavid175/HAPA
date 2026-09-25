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
import { RetryDeliveryForm } from "../orders/forms";

export const metadata: Metadata = { title: "Failed messages" };
export const dynamic = "force-dynamic";

const CHANNEL_LABELS = { email: "Email", sms: "SMS", whatsapp: "WhatsApp" } as const;

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
        // A list, not a table. Each row is one long error sentence and one action; in a
        // table the error either ran through the neighbouring columns (cells are
        // nowrap) or, on a phone, pushed Retry off the right edge where it could not be
        // pressed. Stacked, the error wraps and the button stays put at any width.
        <Card className="py-0">
          <CardContent className="px-0">
            <ul className="divide-y">
              {failures.map((f) => (
                <li key={f.id} className="flex flex-col gap-3 px-4 py-4 sm:px-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium">
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
                      </p>
                      <p className="text-muted-foreground text-sm break-all">
                        {CHANNEL_LABELS[f.channel]} to {f.recipient}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <RetryDeliveryForm deliveryId={f.id} />
                    </div>
                  </div>

                  <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm break-words">
                    {f.error ?? "No error recorded"}
                  </p>

                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="tabular-nums">
                      {f.attempts} attempt{f.attempts === 1 ? "" : "s"}
                    </span>
                    {f.lastAttemptAt ? (
                      <span>Last tried {formatTimestamp(f.lastAttemptAt, tz)}</span>
                    ) : null}
                    {f.exhausted ? <Badge variant="outline">Given up</Badge> : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
