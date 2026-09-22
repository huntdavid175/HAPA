import { createBrowserClient } from "@supabase/ssr";

import { clientEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Browser client, scoped by RLS to whatever the signed-in user may see.
 *
 * Buyers never use this — all buyer writes go through server actions on the secret-key
 * client, because the publishable key has no insert rights on orders or tickets.
 */
export function createClient() {
  const env = clientEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
