import { type NextRequest } from "next/server";

import { isCronAuthorized } from "@/lib/cron-auth";
import { paymentsEnabled } from "@/lib/env";
import { reconcilePayments } from "@/lib/payments/reconcile";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A bounded batch per run; the schedule supplies the rest.
export const maxDuration = 60;

/**
 * Settles Moolre payments that never sent a callback (lib/payments/reconcile.ts).
 * Invoked every two minutes by Supabase Cron (`reconcile-payments`), only when an order
 * is due a check; never by a user.
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return new Response("Not found", { status: 404 });
  }
  if (!paymentsEnabled()) {
    return Response.json({ skipped: "Moolre is not configured" });
  }

  try {
    const result = await reconcilePayments(createAdminClient());
    if (result.settled.length || result.mismatched.length) {
      console.log("reconcile:", JSON.stringify(result));
    }
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

export const GET = POST;
