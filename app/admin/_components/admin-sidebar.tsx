"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangleIcon,
  CalendarDaysIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  ScanLineIcon,
  Share2Icon,
  TicketIcon,
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
} from "@/components/ui/sidebar";

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
  signOutAction,
}: {
  email: string;
  failureCount: number;
  signOutAction: () => void;
}) {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/admin" />}>
              <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <TicketIcon />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">HAPA</span>
                <span className="text-muted-foreground text-xs">Ticketing</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
                   
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>

                  {/* Only worth a badge when there is something to act on. */}
                  {item.href === "/admin/failures" && failureCount > 0 ? (
                    <SidebarMenuBadge>{failureCount}</SidebarMenuBadge>
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
                   
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
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
            <form action={signOutAction}>
              <SidebarMenuButton
                type="submit"
                tooltip={`Sign out ${email}`}
                className="w-full"
              >
                <LogOutIcon />
                <span className="truncate">{email}</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
