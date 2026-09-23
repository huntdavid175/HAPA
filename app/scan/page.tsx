import type { Metadata } from "next";
import Link from "next/link";

import { requireStaffOrAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { signOut } from "@/app/sign-in/actions";
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
    .select("id, name")
    .in("status", ["published", "sales_closed"])
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!event) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <h1 className="text-xl font-bold">Gate</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No event is live, so there is nothing to check in.
        </p>
        <SignOutRow email={viewer.email} />
      </main>
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
    <div className="min-h-dvh">
      <Scanner eventName={event.name} />

      <div className="mx-auto w-full max-w-md px-4 pb-8">
        <p className="rounded-xl border border-border bg-card p-3 text-center text-sm tabular-nums">
          <strong>{checkedIn ?? 0}</strong> of <strong>{issued ?? 0}</strong> checked in
        </p>

        <div className="mt-4 flex items-center justify-between text-sm">
          {viewer.role === "admin" ? (
            <Link href="/admin" className="text-muted-foreground underline">
              Dashboard
            </Link>
          ) : (
            <span className="text-muted-foreground">{viewer.fullName || viewer.email}</span>
          )}
          <form action={signOut}>
            <button type="submit" className="text-muted-foreground underline">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function SignOutRow({ email }: { email: string }) {
  return (
    <div className="mt-6 flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{email}</span>
      <form action={signOut}>
        <button type="submit" className="text-muted-foreground underline">
          Sign out
        </button>
      </form>
    </div>
  );
}
