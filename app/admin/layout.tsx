import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/app/sign-in/actions";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/buyers", label: "Buyers" },
  { href: "/admin/broadcasts", label: "Messages" },
  { href: "/admin/share", label: "Share" },
  { href: "/admin/event", label: "Event" },
  { href: "/admin/staff", label: "Staff" },
] as const;

/**
 * This layout is the authorization boundary for every admin page.
 *
 * `proxy.ts` only checks that *someone* is signed in; requireAdmin is what actually keeps
 * a door-staff account out of the buyer list, and it runs before any child page renders.
 */
export default async function AdminLayout({
  children,
}: LayoutProps<"/admin">) {
  const viewer = await requireAdmin("/admin");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/admin" className="font-semibold">
            Dashboard
          </Link>

          <nav className="flex flex-1 flex-wrap gap-x-4 gap-y-1 text-sm">
            {NAV.slice(1).map((item) => (
              <Link key={item.href} href={item.href} className="text-muted hover:text-foreground">
                {item.label}
              </Link>
            ))}
            <Link href="/scan" className="text-muted hover:text-foreground">
              Scan
            </Link>
          </nav>

          <form action={signOut} className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">{viewer.email}</span>
            <button type="submit" className="text-sm text-muted underline hover:text-foreground">
              Sign out
            </button>
          </form>
        </div>
      </header>

      {children}
    </div>
  );
}
