/**
 * Development seed. Idempotent — safe to re-run.
 *
 * Creates the two accounts the app needs (an admin and a door-staff user) plus one
 * published event with three tiers, so the public page and dashboard have something real
 * to render.
 *
 * Run with:  npm run seed
 *
 * Uses the Admin API under the secret key, which is the only way to create users now that
 * public signup is disabled.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const db = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const STAFF_EMAIL = process.env.SEED_STAFF_EMAIL ?? "staff@example.com";

/** Returns the user id, creating the account only if that email has none yet. */
async function ensureUser(
  email: string,
  role: "admin" | "staff",
  fullName: string,
): Promise<{ id: string; password?: string }> {
  // listUsers is paginated; this project will only ever have a handful of accounts.
  const { data: existing, error: listError } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listError) throw listError;

  const found = existing.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (found) {
    // Keep the profile row in step even if the account predates a role change.
    const { error } = await db
      .from("profiles")
      .update({ role, full_name: fullName })
      .eq("id", found.id);
    if (error) throw error;
    return { id: found.id };
  }

  const password = `${randomBytes(12).toString("base64url")}aA1!`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });
  if (error) throw error;

  // The on_auth_user_created trigger writes the profile row; make sure the role stuck
  // (user_metadata is only trusted here because signup is admin-only).
  const { error: roleError } = await db
    .from("profiles")
    .update({ role, full_name: fullName })
    .eq("id", data.user.id);
  if (roleError) throw roleError;

  return { id: data.user.id, password };
}

async function main() {
  console.log("Seeding…\n");

  const admin = await ensureUser(ADMIN_EMAIL, "admin", "Event Organizer");
  const staff = await ensureUser(STAFF_EMAIL, "staff", "Door Staff");

  // --- Event -------------------------------------------------------------------------
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 30);
  startsAt.setHours(20, 0, 0, 0);

  const { data: event, error: eventError } = await db
    .from("events")
    .upsert(
      {
        slug: "sample-event",
        name: "Sample Event",
        description:
          "A seeded event so the public page and dashboard have something to show. " +
          "Replace this with your real event from the admin dashboard.",
        venue: "Accra International Conference Centre",
        starts_at: startsAt.toISOString(),
        timezone: "Africa/Accra",
        status: "published",
      },
      { onConflict: "slug" },
    )
    .select()
    .single();
  if (eventError) throw eventError;

  // --- Tiers -------------------------------------------------------------------------
  // Prices are integer pesewas: 3500 = GHS 35.00
  const tiers = [
    { name: "Early Bird", price_pesewas: 3500, capacity: 50, position: 0,
      description: "Limited early release." },
    { name: "Regular", price_pesewas: 5000, capacity: 300, position: 1,
      description: "General admission." },
    { name: "VIP", price_pesewas: 20000, capacity: 40, position: 2,
      description: "Front section, dedicated entrance." },
  ];

  const { error: tierError } = await db
    .from("ticket_tiers")
    .upsert(
      tiers.map((t) => ({ ...t, event_id: event.id })),
      { onConflict: "event_id,name" },
    );
  if (tierError) throw tierError;

  // --- Summary -----------------------------------------------------------------------
  console.log(`  event   ${event.name} (/${event.slug}) — ${event.status}`);
  console.log(`  tiers   ${tiers.map((t) => t.name).join(", ")}`);
  console.log(`  admin   ${ADMIN_EMAIL}`);
  if (admin.password) console.log(`          password: ${admin.password}`);
  else console.log("          (already existed — password unchanged)");
  console.log(`  staff   ${STAFF_EMAIL}`);
  if (staff.password) console.log(`          password: ${staff.password}`);
  else console.log("          (already existed — password unchanged)");
  console.log("\nSeed complete. Save those passwords — they are not shown again.");
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message ?? err);
  process.exit(1);
});
