import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type Role = Database["public"]["Enums"]["user_role"];

export type Viewer = {
  id: string;
  email: string;
  role: Role;
  fullName: string;
};

/**
 * The real authorization boundary.
 *
 * `proxy.ts` only bounces signed-out visitors — it deliberately does no database work, so
 * it cannot know anyone's role. Every admin or staff surface must call one of the
 * `require*` helpers below; treating the proxy redirect as the security check is how a
 * door-staff account ends up reading the buyer list.
 */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();

  // getUser() revalidates the token with Supabase. getSession() would trust a cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  // An auth user with no profile row means the trigger did not fire. Refuse rather than
  // guess at a role.
  if (!profile) return null;

  return {
    id: user.id,
    email: user.email ?? "",
    role: profile.role,
    fullName: profile.full_name,
  };
}

export async function requireViewer(next?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) {
    redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  }
  return viewer;
}

/** Admin-only surfaces. Staff are sent to the one screen they do have. */
export async function requireAdmin(next?: string): Promise<Viewer> {
  const viewer = await requireViewer(next);
  if (viewer.role !== "admin") redirect("/scan");
  return viewer;
}

/** The gate: both roles may scan. */
export async function requireStaffOrAdmin(next?: string): Promise<Viewer> {
  return requireViewer(next);
}
