"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export type SignInState = { error: string | null };

/**
 * Sign-in runs as a Server Action rather than in the browser so the session cookie is set
 * by the server on the same response — a Server Component cannot write cookies, which is
 * why this cannot live in a page.
 */
export async function signIn(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Deliberately vague: distinguishing "no such user" from "wrong password" tells an
    // attacker which emails exist.
    return { error: "Those details didn't work. Check your email and password." };
  }

  // Only ever redirect within this site — an open redirect here would be a phishing gift.
  const target = parsed.data.next;
  const safeTarget = target?.startsWith("/") && !target.startsWith("//") ? target : "/admin";
  redirect(safeTarget);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
