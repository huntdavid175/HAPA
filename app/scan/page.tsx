import type { Metadata } from "next";
import Link from "next/link";

import { requireStaffOrAdmin } from "@/lib/auth";
import { signOut } from "@/app/sign-in/actions";

export const metadata: Metadata = { title: "Scan" };
export const dynamic = "force-dynamic";

/**
 * Placeholder for the gate. The real scanner (camera + code lookup) is its own phase —
 * this exists now so door-staff accounts have somewhere to land instead of a 404, and so
 * the role split is testable end to end.
 */
export default async function ScanPage() {
  const viewer = await requireStaffOrAdmin("/scan");

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold">Gate</h1>
        <form action={signOut}>
          <button type="submit" className="text-sm text-muted underline">
            Sign out
          </button>
        </form>
      </div>

      <p className="mt-1 text-sm text-muted">
        Signed in as {viewer.fullName || viewer.email}
        {viewer.role === "admin" ? " (admin)" : " (door staff)"}
      </p>

      <div className="mt-8 rounded-xl border border-dashed border-border p-5">
        <h2 className="font-semibold">Scanner not built yet</h2>
        <p className="mt-1 text-sm text-muted">
          QR scanning and check-in by ticket code are coming in the gate phase. There is
          nothing to scan yet — no tickets have been issued.
        </p>
      </div>

      {viewer.role === "admin" ? (
        <Link href="/admin" className="mt-6 inline-block text-sm underline">
          Back to dashboard
        </Link>
      ) : null}
    </main>
  );
}
