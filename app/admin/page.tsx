import type { Metadata } from "next";
import Link from "next/link";

import { getEventStats } from "@/lib/admin/stats";
import { formatPesewas, formatEventDate, formatEventTime } from "@/lib/format";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const stats = await getEventStats();

  if (!stats) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold">No live event</h1>
        <p className="mt-2 text-sm text-muted">
          Nothing is published yet, so there is nothing to sell or report on.
        </p>
        <Link
          href="/admin/event"
          className="mt-5 inline-block rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"
        >
          Set up your event
        </Link>
      </main>
    );
  }

  const noSalesYet = stats.ticketsSold === 0;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{stats.eventName}</h1>
          <p className="mt-1 text-sm text-muted">
            {formatEventDate(stats.startsAt, stats.timezone)} ·{" "}
            {formatEventTime(stats.startsAt, stats.timezone)}
          </p>
        </div>
        <Link href={`/e/${stats.eventSlug}`} className="text-sm text-muted underline">
          View public page
        </Link>
      </div>

      {/* Anything needing attention goes above the numbers. */}
      {stats.failedDeliveries > 0 || stats.unprocessedWebhooks > 0 ? (
        <div className="mt-6 rounded-xl border border-warning/40 bg-card p-4">
          <h2 className="text-sm font-semibold text-warning">Needs attention</h2>
          <ul className="mt-1.5 space-y-1 text-sm">
            {stats.failedDeliveries > 0 ? (
              <li>
                {stats.failedDeliveries} ticket message
                {stats.failedDeliveries === 1 ? "" : "s"} failed to send
              </li>
            ) : null}
            {stats.unprocessedWebhooks > 0 ? (
              <li>
                {stats.unprocessedWebhooks} payment webhook
                {stats.unprocessedWebhooks === 1 ? "" : "s"} not processed
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tickets sold" value={String(stats.ticketsSold)} />
        <Stat label="Revenue" value={formatPesewas(stats.revenuePesewas)} />
        <Stat label="Orders" value={String(stats.paidOrders)} />
        <Stat label="Checked in" value={String(stats.checkedIn)} />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Tiers</h2>
        <ul className="mt-3 space-y-3">
          {stats.tiers.map((tier) => {
            const pct = Math.round((tier.sold / tier.capacity) * 100);
            return (
              <li key={tier.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-medium">{tier.name}</h3>
                  <p className="text-sm text-muted tabular-nums">
                    {formatPesewas(tier.pricePesewas)} · {tier.sold}/{tier.capacity} sold
                    {tier.held > 0 ? ` · ${tier.held} held` : ""}
                  </p>
                </div>
                <div
                  className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-border"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${tier.name} sold`}
                >
                  <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Recent purchases</h2>
        {noSalesYet ? (
          <p className="mt-3 rounded-xl border border-border bg-card p-4 text-sm text-muted">
            No tickets sold yet. Purchases will appear here as they happen — online payment
            is still being set up.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {stats.recentOrders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-baseline justify-between gap-2 p-4">
                <div>
                  <p className="font-medium">{order.buyerName}</p>
                  <p className="text-sm text-muted">
                    {order.buyerPhone} · {order.ticketCount} ticket
                    {order.ticketCount === 1 ? "" : "s"}
                    {order.channel ? ` · ${order.channel}` : ""}
                  </p>
                </div>
                <p className="font-medium tabular-nums">
                  {formatPesewas(order.totalPesewas)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
    </div>
  );
}
