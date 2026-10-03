"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Marks a ticket request handled — the organiser has arranged it — or reopens it.
 * Reversible, so it does not ask first, unlike the destructive actions.
 */
export async function setRequestHandled(formData: FormData): Promise<void> {
  await requireAdmin("/admin/requests");

  const id = String(formData.get("id") ?? "");
  const handled = formData.get("handled") === "true";
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("ticket_requests")
    .update(
      handled
        ? { status: "handled", handled_at: new Date().toISOString() }
        : { status: "new", handled_at: null },
    )
    .eq("id", id);

  revalidatePath("/admin/requests");
  revalidatePath("/admin", "layout");
}
