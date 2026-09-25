"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/** Same names as the sidebar, so the bar and the highlighted nav item always agree. */
const SECTIONS: { href: string; label: string }[] = [
  { href: "/admin/buyers", label: "Buyers" },
  { href: "/admin/orders", label: "Buyers" },
  { href: "/admin/failures", label: "Failed messages" },
  { href: "/admin/event", label: "Event" },
  { href: "/admin/broadcasts", label: "Messages" },
  { href: "/admin/share", label: "Share kit" },
  { href: "/admin/staff", label: "Staff" },
];

/**
 * The bar across the top of every admin page. Pinned, so the sidebar toggle and the
 * answer to "where am I" stay in reach on long pages like the buyer list.
 *
 * It used to say "Admin" on every page — true everywhere, so it told you nothing. It now
 * names the page, and an order (reached from Buyers or Failed messages) sits under Buyers
 * with a way back.
 */
export function AdminHeader() {
  const pathname = usePathname();
  const section = SECTIONS.find((s) => pathname.startsWith(s.href));
  const isOrder = pathname.startsWith("/admin/orders/");

  return (
    <header className="bg-background/85 supports-backdrop-filter:backdrop-blur-md sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />

      <Breadcrumb>
        <BreadcrumbList>
          {/* On a phone the bar has room for the page name only. */}
          <BreadcrumbItem className={section ? "hidden sm:inline-flex" : undefined}>
            {section ? (
              <BreadcrumbLink render={<Link href="/admin" />}>Admin</BreadcrumbLink>
            ) : (
              <BreadcrumbPage>Overview</BreadcrumbPage>
            )}
          </BreadcrumbItem>

          {section ? (
            <>
              <BreadcrumbSeparator className="hidden sm:inline-flex" />
              <BreadcrumbItem>
                {isOrder ? (
                  <BreadcrumbLink render={<Link href="/admin/buyers" />}>
                    {section.label}
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{section.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </>
          ) : null}

          {isOrder ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Order</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : null}

        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}
