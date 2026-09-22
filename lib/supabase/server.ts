import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { clientEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Request-scoped client that carries the signed-in user's session. Subject to RLS.
 *
 * Use this for anything acting *as the user* — the admin dashboard, the scanner. For
 * buyer-facing writes use the secret-key client in ./admin.
 *
 * `cookies()` is async in Next 16, so this function is too.
 */
export async function createClient() {
  const env = clientEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only. Session
            // refresh happens in proxy.ts instead, so this is safe to swallow.
          }
        },
      },
    },
  );
}
