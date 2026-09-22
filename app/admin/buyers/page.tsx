import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { formatPesewas } from "@/lib/format";

export const metadata: Metadata = { title: "Buyers" };
export const dynamic = "force-dynamic";

export default async function BuyersPage({ searchParams }: PageProps<"/admin/buyers">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  const supabase = await createClient();

  let request = supabase
    .from("orders")
    .select(
      "id, buyer_name, buyer_phone, buyer_email, total_pesewas, status, paystack_channel, created_at, tickets(id, status)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (query) {
    // Escape PostgREST's or() delimiters so a comma or paren in the search can't alter
    // the filter expression.
    const safe = query.replace(/[,()]/g, " ");
    request = request.or(
      `buyer_name.ilike.%${safe}%,buyer_phone.ilike.%${safe}%,buyer_email.ilike.%${safe}%`,
    );
  }

  const { data: orders, error } = await request;
  if (error) throw error;

  const rows = orders ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">Buyers</h1>
        <Link
          href={`/admin/buyers/export${query ? `?q=${encodeURIComponent(query)}` : ""}`}
          prefetch={false}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium"
        >
          Export CSV
        </Link>
      </div>

      <form className="mt-4" role="search">
        <label htmlFor="q" className="sr-only">
          Search by name, phone or email
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Search name, phone or email"
          className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-base"
        />
      </form>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-border bg-card p-4 text-sm text-muted">
          {query
            ? `No buyers match “${query}”.`
            : "No one has bought a ticket yet. Buyers will appear here once online payment is live."}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-card text-xs text-muted uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Buyer</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Tickets</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((order) => {
                const tickets = Array.isArray(order.tickets) ? order.tickets : [];
                const checkedIn = tickets.filter((t) => t.status === "checked_in").length;
                return (
                  <tr key={order.id}>
                    <td className="px-4 py-3 font-medium">{order.buyer_name}</td>
                    <td className="px-4 py-3 text-muted">
                      <div>{order.buyer_phone}</div>
                      <div className="text-xs">{order.buyer_email}</div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {tickets.length}
                      {checkedIn > 0 ? (
                        <span className="text-muted"> · {checkedIn} in</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatPesewas(order.total_pesewas)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          order.status === "paid"
                            ? "text-success"
                            : order.status === "pending"
                              ? "text-warning"
                              : "text-muted"
                        }
                      >
                        {order.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
