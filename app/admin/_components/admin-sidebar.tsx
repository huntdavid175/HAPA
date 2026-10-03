"use client";

import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangleIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
  InboxIcon,
  LayoutDashboardIcon,
  ScanLineIcon,
  Share2Icon,
  UsersIcon,
  UserCogIcon,
  MessageSquareIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { SignOutDialog } from "./sign-out-dialog";

/**
 * Grouped by when you reach for them, not alphabetically.
 *
 * "Tonight" is what an organiser opens on event night with a queue at the door; "Setup"
 * is the work done in the weeks before. Keeping them apart means the thing you need at
 * 9pm is never buried under the thing you did last month.
 */
type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType;
  /** Match this path exactly — "/admin" would otherwise light up on every child route. */
  exact?: boolean;
};

const TONIGHT: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboardIcon, exact: true },
  { href: "/admin/buyers", label: "Buyers", icon: UsersIcon },
  { href: "/admin/registrations", label: "Registrations", icon: ClipboardListIcon },
  { href: "/admin/requests", label: "Ticket requests", icon: InboxIcon },
  { href: "/admin/failures", label: "Failed messages", icon: AlertTriangleIcon },
  { href: "/scan", label: "Scan tickets", icon: ScanLineIcon },
];

const SETUP: NavItem[] = [
  { href: "/admin/event", label: "Event", icon: CalendarDaysIcon },
  { href: "/admin/broadcasts", label: "Messages", icon: MessageSquareIcon },
  { href: "/admin/share", label: "Share kit", icon: Share2Icon },
  { href: "/admin/staff", label: "Staff", icon: UserCogIcon },
];

export function AdminSidebar({
  email,
  failureCount,
  requestCount,
  signOutAction,
}: {
  email: string;
  failureCount: number;
  /** Ticket requests not yet marked handled. */
  requestCount: number;
  signOutAction: () => void;
}) {
  const pathname = usePathname();
  // On a phone the menu is a sheet over the page. Left open, it hid the page loading
  // behind it, and a tap looked like it had done nothing.
  const { setOpenMobile } = useSidebar();
  const closeMobile = () => setOpenMobile(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <Sidebar collapsible="icon">
      {/* The HAPAwards logo, on white in both colour schemes: its figure is black and
          would vanish on the dark sidebar. Collapsed to icons, only the globe fits. */}
      <SidebarHeader>
        <Link
          href="/admin"
          onClick={closeMobile}
          aria-label="HAPAwards admin, overview"
          className="block rounded-lg bg-white px-3 py-2.5 ring-1 ring-sidebar-border transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none group-data-[collapsible=icon]:hidden"
        >
          <Image
            src="/brand/hapa-logo.png"
            alt=""
            width={377}
            height={248}
            priority
            className="mx-auto h-auto w-full max-w-36"
          />
        </Link>
        <Link
          href="/admin"
          onClick={closeMobile}
          aria-label="HAPAwards admin, overview"
          className="hidden rounded-lg focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none group-data-[collapsible=icon]:block"
        >
          <Image
            src="/brand/hapa-mark.png"
            alt=""
            width={128}
            height={128}
            className="size-8 rounded-lg ring-1 ring-sidebar-border"
          />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Tonight</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {TONIGHT.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isActive(item.href, item.exact)}
                    tooltip={item.label}
                    render={<Link href={item.href} onClick={closeMobile} />}
                  >
                    <NavIcon icon={item.icon} />
                    <span>{item.label}</span>
                  </SidebarMenuButton>

                  {/* Only worth a badge when there is something to act on. */}
                  {item.href === "/admin/failures" && failureCount > 0 ? (
                    <SidebarMenuBadge>{failureCount}</SidebarMenuBadge>
                  ) : null}
                  {item.href === "/admin/requests" && requestCount > 0 ? (
                    <SidebarMenuBadge>{requestCount}</SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Setup</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {SETUP.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isActive(item.href)}
                    tooltip={item.label}
                    render={<Link href={item.href} onClick={closeMobile} />}
                  >
                    <NavIcon icon={item.icon} />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SignOutDialog email={email} signOutAction={signOutAction} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

/**
 * The item's icon, or a spinner from the moment it is clicked until the page changes.
 *
 * The highlight only moves once the new page arrives, so without this a slow page looked
 * like a click that had not registered, and organisers clicked again. It is decided in
 * the browser, so it shows even before the server has answered. Same size as the icon, so
 * nothing shifts.
 */
function NavIcon({ icon: Icon }: { icon: React.ComponentType }) {
  const { pending } = useLinkStatus();
  return pending ? <Spinner aria-hidden role={undefined} aria-label={undefined} /> : <Icon />;
}
