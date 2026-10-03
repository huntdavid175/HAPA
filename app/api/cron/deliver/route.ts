import { type NextRequest } from "next/server";

import { isCronAuthorized } from "@/lib/cron-auth";
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
  if (!isCronAuthorized(request)) {
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
