import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/app/sign-in/actions";
import { getFailedDeliveries } from "@/lib/admin/orders";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AdminSidebar } from "./_components/admin-sidebar";

/**
 * This layout is the authorization boundary for every admin page.
 *
 * `proxy.ts` only checks that *someone* is signed in; requireAdmin is what actually keeps
 * a door-staff account out of the buyer list, and it runs before any child page renders.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await requireAdmin("/admin");

  // Drives the count beside "Failed messages". An undelivered ticket is someone who gets
  // turned away at the door, so it is worth carrying in the chrome rather than making
  // an organiser go looking for it.
  const failures = await getFailedDeliveries(50);

  return (
    <SidebarProvider>
      <AdminSidebar
        email={viewer.email ?? "Signed in"}
        failureCount={failures.length}
        signOutAction={signOut}
      />

      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm font-medium">Admin</span>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
