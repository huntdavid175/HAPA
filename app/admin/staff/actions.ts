"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type StaffState = {
  error: string | null;
  /** Shown once, immediately after creation — it is never retrievable again. */
  created: { email: string; password: string } | null;
};

const schema = z.object({
  email: z.email("Enter a valid email address"),
  fullName: z.string().trim().min(1, "Enter a name").max(120),
  role: z.enum(["admin", "staff"]),
});

/**
 * Creates a gate-staff (or second admin) account.
 *
 * Public signup is disabled, so this goes through the Admin API under the secret key —
 * verified to still work with signups off. We generate the password rather than asking
 * for one: these accounts get handed out at the door and a human-chosen password on a
 * shared phone is the weakest link in the whole system.
 */
export async function createStaffAccount(
  _prev: StaffState,
  formData: FormData,
): Promise<StaffState> {
  await requireAdmin();

  const parsed = schema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form", created: null };
  }

  const { email, fullName, role } = parsed.data;

  // Mixed case, digits and a symbol, so it satisfies the strictest Supabase password
  // requirements without the admin having to think about it.
  const password = `${randomBytes(12).toString("base64url")}aA1!`;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });

  if (error) {
    const alreadyExists = /already|registered|exists/i.test(error.message);
    return {
      error: alreadyExists
        ? "An account with that email already exists"
        : error.message,
      created: null,
    };
  }

  // The trigger creates the profile with a default role; set the real one explicitly
  // rather than trusting user_metadata, which is editable by the user themselves.
  const { error: roleError } = await admin
    .from("profiles")
    .update({ role, full_name: fullName })
    .eq("id", data.user.id);

  if (roleError) {
    return { error: `Account created but role not set: ${roleError.message}`, created: null };
  }

  revalidatePath("/admin/staff");
  return { error: null, created: { email, password } };
}

export async function removeStaffAccount(
  _prev: StaffState,
  formData: FormData,
): Promise<StaffState> {
  const viewer = await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string") return { error: "Unknown account", created: null };

  // Locking yourself out of your own dashboard on event night would be unrecoverable
  // without the Supabase console.
  if (id === viewer.id) {
    return { error: "You cannot remove your own account", created: null };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return { error: error.message, created: null };

  revalidatePath("/admin/staff");
  return { error: null, created: null };
}
