import type { Metadata } from "next";
import { CheckIcon, XIcon } from "lucide-react";

import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AddStaffSheet, RemoveStaffButton } from "./forms";

export const metadata: Metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

/**
 * Who can get into the admin and the gate scanner, and what each role is allowed.
 *
 * The permissions card is the point of the side column: choosing a role is choosing
 * whether someone can see every buyer's phone number, and that should be decided with
 * the list in front of you rather than from a one-line option label.
 */
export default async function StaffPage() {
  const viewer = await requireAdmin();

  // Emails live on auth.users, which is not reachable through the Data API — so the
  // listing needs the Admin API rather than a normal table read.
  const admin = createAdminClient();
  const [{ data: authUsers }, { data: profiles }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin.from("profiles").select("id, role, full_name").order("role"),
  ]);

  const emailById = new Map(authUsers.users.map((u) => [u.id, u.email ?? ""]));
  const accounts = (profiles ?? [])
    .map((p) => ({ ...p, email: emailById.get(p.id) ?? "" }))
    // You first, then admins, then door staff, each alphabetical.
    .sort(
      (a, b) =>
        Number(b.id === viewer.id) - Number(a.id === viewer.id) ||
        (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1) ||
        (a.full_name || a.email).localeCompare(b.full_name || b.email),
    );

  const admins = accounts.filter((a) => a.role === "admin").length;
  const doorStaff = accounts.length - admins;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
          <p className="text-muted-foreground text-sm">
            Everyone who can sign in: admins who run the event, and door staff who scan
            tickets.
          </p>
        </div>
        <AddStaffSheet />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Team</CardTitle>
            <CardDescription>
              {admins} admin{admins === 1 ? "" : "s"} and {doorStaff} door staff.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {accounts.map((account) => {
                const name = account.full_name || account.email;
                const isYou = account.id === viewer.id;
                return (
                  <li
                    key={account.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <Avatar>
                      <AvatarFallback className="text-xs font-medium">
                        {initials(name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="truncate">{name}</span>
                        {isYou ? <Badge variant="outline">You</Badge> : null}
                      </p>
                      {account.full_name ? (
                        <p className="text-muted-foreground truncate text-xs">
                          {account.email}
                        </p>
                      ) : null}
                    </div>

                    <Badge variant={account.role === "admin" ? "default" : "secondary"}>
                      {account.role === "admin" ? "Admin" : "Door staff"}
                    </Badge>

                    {/* Removing yourself would lock you out of the dashboard with no way
                        back in short of the Supabase console. */}
                    <div className="w-[4.5rem] shrink-0 text-right">
                      {isYou ? null : <RemoveStaffButton id={account.id} name={name} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What each role can do</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <RoleSummary
              name="Door staff"
              can={["Scan tickets at the gate", "Look up a ticket by code or name"]}
              cannot={["See buyers or revenue", "Send messages", "Change the event"]}
            />
            <RoleSummary
              name="Admin"
              can={[
                "Everything door staff can",
                "Buyers, orders and revenue",
                "Event settings and messages",
                "Add and remove staff",
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function RoleSummary({
  name,
  can,
  cannot = [],
}: {
  name: string;
  can: string[];
  cannot?: string[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{name}</p>
      <ul className="flex flex-col gap-1.5 text-sm">
        {can.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <CheckIcon className="text-success mt-0.5 size-4 shrink-0" />
            {item}
          </li>
        ))}
        {cannot.map((item) => (
          <li key={item} className="text-muted-foreground flex items-start gap-2">
            <XIcon className="mt-0.5 size-4 shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Ama Owusu" → "AO", "kofi@example.com" → "KO". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
