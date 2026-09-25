import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboardIcon, TicketXIcon } from "lucide-react";

import { requireStaffOrAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { signOut } from "@/app/sign-in/actions";
import { Button } from "@/components/ui/button";
import { GateSignOut } from "./gate-sign-out";
import { Scanner } from "./scanner";

export const metadata: Metadata = { title: "Gate" };
export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const viewer = await requireStaffOrAdmin("/scan");

  // Staff have no RLS access to events beyond the public ones, and none at all to
  // tickets — the counts come from the secret-key client after the role check above.
  const db = createAdminClient();

  const { data: event } = await db
    .from("events")
    .select("id, name, timezone")
    .in("status", ["published", "sales_closed"])
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const footer = (
    <footer className="mx-auto mt-auto flex w-full max-w-md items-center justify-between gap-3 px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm">
      <span className="text-muted-foreground min-w-0 truncate">
        {viewer.fullName || viewer.email}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        {viewer.role === "admin" ? (
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href="/admin" />}
          >
            <LayoutDashboardIcon data-icon="inline-start" />
            Dashboard
          </Button>
        ) : null}
        <GateSignOut signOutAction={signOut} />
      </div>
    </footer>
  );

  if (!event) {
    return (
      <div className="flex min-h-dvh flex-col">
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <span className="bg-muted flex size-12 items-center justify-center rounded-full">
            <TicketXIcon className="text-muted-foreground size-6" />
          </span>
          <h1 className="text-lg font-semibold">No event is live</h1>
          <p className="text-muted-foreground text-sm">
            There is nothing to check in until an event is published.
          </p>
        </main>
        {footer}
      </div>
    );
  }

  const [{ count: issued }, { count: checkedIn }] = await Promise.all([
    db
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .in("status", ["issued", "checked_in"]),
    db
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("status", "checked_in"),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1">
        <Scanner
          eventName={event.name}
          issued={issued ?? 0}
          checkedIn={checkedIn ?? 0}
          timezone={event.timezone}
        />
      </main>
      {footer}
    </div>
  );
}
