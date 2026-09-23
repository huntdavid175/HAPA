import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateStaffForm, RemoveStaffButton } from "./forms";

export const metadata: Metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

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
  const accounts = (profiles ?? []).map((p) => ({
    ...p,
    email: emailById.get(p.id) ?? "",
  }));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-xl font-bold sm:text-2xl">Staff accounts</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Door staff can scan tickets and look them up by code or name. They cannot see the
        buyer list, revenue, or send messages.
      </p>

      <section className="mt-6">
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex flex-wrap items-center justify-between gap-2 p-4"
            >
              <div>
                <p className="font-medium">
                  {account.full_name || account.email}
                  {account.id === viewer.id ? (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  ) : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {account.email} · {account.role === "admin" ? "Admin" : "Door staff"}
                </p>
              </div>
              {account.id === viewer.id ? null : (
                <RemoveStaffButton
                  id={account.id}
                  name={account.full_name || account.email}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Add someone</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          A password is generated for them and shown once.
        </p>
        <CreateStaffForm />
      </section>
    </main>
  );
}
