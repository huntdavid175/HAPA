import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/app/sign-in/actions";
import { getFailedDeliveries } from "@/lib/admin/orders";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AdminHeader } from "./_components/admin-header";
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
        <AdminHeader />

        {/* Content is capped and centred, the way Shopify's admin does it, while the
            sidebar and header still span the window. Uncapped, a 27-inch screen stretched
            the stat cards into long thin strips and pushed each row's figures a full
            screen away from its label. Pages that want a narrower column (staff, share
            kit) still set their own max-width inside this one. */}
        <div className="flex flex-1 flex-col p-4 md:p-6">
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
