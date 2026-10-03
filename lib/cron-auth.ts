import "server-only";

import { timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env";

/**
 * Whether a request to a scheduled route carries `CRON_SECRET`, as
 * `Authorization: Bearer …` (Supabase Cron, Vercel Cron) or `x-cron-secret`.
 *
 * Compared in constant time. Without it these are endpoints anyone could hammer — to
 * burn SMS credit, or to make us query Moolre on repeat.
 */
export function isCronAuthorized(request: Request): boolean {
  const expected = serverEnv().CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ")
    ? header.slice(7)
    : (request.headers.get("x-cron-secret") ?? "");

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so check that first — comparing lengths is
  // not the leak, comparing contents byte-by-byte would be.
  return a.length === b.length && timingSafeEqual(a, b);
}
