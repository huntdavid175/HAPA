import { type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env";
import { runDeliveryWorker } from "@/lib/messaging/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Serverless invocations are capped; the worker takes a bounded batch and the schedule
// supplies the rest, so this never needs to run long.
export const maxDuration = 60;

/**
 * Drains the message outbox. Invoked on a schedule (Vercel Cron), not by a user.
 *
 * Guarded by a shared secret compared in constant time. Without it this is an endpoint
 * anyone can hammer to burn your SMS credit.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const result = await runDeliveryWorker(50);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

// Vercel Cron issues GETs; accept both so the schedule and manual runs behave the same.
export const GET = POST;

function isAuthorized(request: NextRequest): boolean {
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
