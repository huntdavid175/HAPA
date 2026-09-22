import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { clientEnv, serverEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Secret-key client (formerly "service role"). **Bypasses RLS entirely.**
 *
 * Only for server-side paths that must act outside any user session:
 *   - buyer checkout (buyers are anonymous and the publishable key cannot insert orders)
 *   - the Paystack webhook (no user, must issue tickets)
 *   - cron workers (hold expiry, message delivery)
 *
 * Never import this into a Client Component — `server-only` turns that into a build
 * error rather than a leaked key.
 */
export function createAdminClient() {
  const pub = clientEnv();
  const env = serverEnv();

  return createSupabaseClient<Database>(
    pub.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      auth: {
        // No session to persist or refresh — this client is stateless per request.
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
