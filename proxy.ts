import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { clientEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Proxy — what used to be `middleware.ts` before Next.js 16.
 *
 * Two jobs, both deliberately cheap:
 *   1. Refresh the Supabase session cookie so server components see a live session.
 *   2. An *optimistic* auth gate on /admin and /scan — bounce signed-out visitors.
 *
 * Role checks (admin vs door staff) are NOT done here. Proxy runs on every matched
 * request and is the wrong place for a database round-trip; the real authorization
 * lives in the admin and scan layouts where it can read `profiles`. Treat this as a
 * redirect for UX, never as the security boundary.
 */

const PROTECTED_PREFIXES = ["/admin", "/scan"];

export async function proxy(request: NextRequest) {
  const env = clientEnv();

  // Supabase needs to write refreshed auth cookies onto the response we return, so the
  // response object is created up front and mutated in setAll.
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Use getUser(), not getSession(): it revalidates the token with Supabase rather than
  // trusting a cookie the client could have forged.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isProtected && !user) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(signIn);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Webhooks and cron routes are left
     * in deliberately — they carry no session, cost one no-op pass, and excluding paths
     * by hand is how a protected route accidentally stops being protected.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
