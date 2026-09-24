import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { ComposeForm, DrainButton } from "./forms";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

export default async function BroadcastsPage() {
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name")
    .not("status", "eq", "archived")
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!event) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-xl font-bold sm:text-2xl">Messages</h1>
        <p className="mt-2 text-sm text-muted-foreground">Create an event before messaging anyone.</p>
        <Link href="/admin/event" className="mt-4 inline-block text-sm underline">
          Set up your event
        </Link>
      </main>
    );
  }

  const [{ data: tiers }, { data: broadcasts }, { count: buyerCount }] = await Promise.all([
    supabase
      .from("ticket_tiers")
      .select("id, name")
      .eq("event_id", event.id)
      .eq("active", true)
      .order("position")
      .order("created_at"),
    supabase
      .from("broadcasts")
      .select("*")
      .eq("event_id", event.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("status", "paid"),
  ]);

  const provider = serverEnv().MESSAGING_PROVIDER;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-xl font-bold sm:text-2xl">Messages</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Message everyone holding a ticket — a time change, a reminder, directions. One
        message per buyer, not per ticket.
      </p>

      {provider === "stub" ? (
        <p className="mt-5 rounded-xl border border-warning/40 bg-card p-4 text-sm">
          <strong className="text-warning">No SMS provider connected yet.</strong>{" "}
          Everything below works and is recorded, but nothing actually leaves the building.
          Messages queue up and will show as sent by the <code>stub</code> provider. Wire
          up Moolre to send for real.
        </p>
      ) : null}

      {buyerCount === 0 ? (
        <p className="mt-4 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Nobody has bought a ticket yet, so there is no audience. You can still compose
          and queue a message — it will simply match zero recipients.
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Current audience: <strong>{buyerCount}</strong> buyer
          {buyerCount === 1 ? "" : "s"} with paid tickets.
        </p>
      )}

      <section className="mt-8 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="mb-4 text-lg font-semibold">New message</h2>
        <ComposeForm eventId={event.id} tiers={tiers ?? []} />
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Sent messages</h2>
          <DrainButton />
        </div>

        {(broadcasts ?? []).length === 0 ? (
          <p className="mt-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Nothing sent yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {(broadcasts ?? []).map((b) => (
              <li key={b.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs text-muted-foreground uppercase">
                    {b.channels.join(" · ")} · {b.status}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {b.sent_count}/{b.recipient_count} sent
                    {b.failed_count > 0 ? ` · ${b.failed_count} failed` : ""}
                  </p>
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap">{b.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
