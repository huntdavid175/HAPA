import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon, SearchIcon, UsersIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { formatPesewas } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Buyers" };
export const dynamic = "force-dynamic";

/** paid is the good case; pending is in-flight; anything else is dead. */
function statusVariant(status: string) {
  if (status === "paid") return "default" as const;
  if (status === "pending") return "secondary" as const;
  return "outline" as const;
}

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
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Buyers</h1>
          <p className="text-muted-foreground text-sm">
            Everyone who has started or completed an order.
          </p>
        </div>

        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link
              href={`/admin/buyers/export${query ? `?q=${encodeURIComponent(query)}` : ""}`}
              prefetch={false}
            />
          }
        >
          <DownloadIcon data-icon="inline-start" />
          Export CSV
        </Button>
      </div>

      <form role="search" className="max-w-sm">
        <label htmlFor="q" className="sr-only">
          Search by name, phone or email
        </label>
        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search name, phone or email"
            className="pl-9"
          />
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>{query ? "No matches" : "No buyers yet"}</EmptyTitle>
            <EmptyDescription>
              {query
                ? `Nothing matches “${query}”. Try a partial phone number or surname.`
                : "Buyers appear here as soon as the first order comes through."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Tickets</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((order) => {
                  const tickets = Array.isArray(order.tickets) ? order.tickets : [];
                  const checkedIn = tickets.filter(
                    (t) => t.status === "checked_in",
                  ).length;

                  return (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {order.buyer_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div>{order.buyer_phone}</div>
                        <div className="text-xs">{order.buyer_email}</div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {tickets.length}
                        {checkedIn > 0 ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {checkedIn} in
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPesewas(order.total_pesewas)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(order.status)}>
                          {order.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
