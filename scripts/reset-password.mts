/**
 * Sets a new password on a seeded account and prints it once.
 *
 * `seed.mts` generates passwords, shows them once and never stores them, which is right
 * — but it means losing the terminal scrollback locks you out of your own dashboard.
 * Public signup is disabled and both accounts use @example.com addresses that cannot
 * receive a reset email, so this is the recovery path.
 *
 * Runs under the secret key, so it never leaves your machine.
 *
 *   npm run reset:password                      # both seeded accounts
 *   npm run reset:password admin@example.com    # just one
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !secret || !publishable) {
  console.error("Run with: node --env-file=.env.local scripts/reset-password.mts");
  process.exit(1);
}

const db = createClient(url, secret, { auth: { persistSession: false } });

/** Mixed case, digits and a symbol, so it satisfies the strictest Supabase policy. */
const generate = () => `${randomBytes(9).toString("base64url")}aA1!`;

const main = async () => {
  const targets = process.argv.slice(2);
  const { data, error } = await db.auth.admin.listUsers();
  if (error) throw error;

  const users = targets.length
    ? data.users.filter((u) => targets.includes(u.email ?? ""))
    : data.users;

  if (users.length === 0) {
    console.error(
      targets.length
        ? `No account matches ${targets.join(", ")}`
        : "No accounts exist. Run: npm run seed",
    );
    process.exit(1);
  }

  const issued: { email: string; password: string }[] = [];

  for (const user of users) {
    const password = generate();
    const { error: updateError } = await db.auth.admin.updateUserById(user.id, {
      password,
    });
    if (updateError) {
      console.error(`  FAILED ${user.email}: ${updateError.message}`);
      continue;
    }
    issued.push({ email: user.email ?? user.id, password });
  }

  // Prove the new password actually works rather than trusting the update call. A
  // password policy rejection can surface as a successful-looking write.
  const anon = createClient(url, publishable, { auth: { persistSession: false } });

  console.log("");
  for (const { email, password } of issued) {
    const { error: signInError } = await anon.auth.signInWithPassword({
      email,
      password,
    });
    console.log(`  ${email}`);
    console.log(`    password: ${password}`);
    console.log(`    sign-in:  ${signInError ? `FAILED — ${signInError.message}` : "OK"}`);
  }

  console.log("\nSave these now — they are not shown again.");
  console.log("To run the auth suite, put the admin one in .env.local as:");
  console.log("  CHECK_ADMIN_PASSWORD=…\n  CHECK_STAFF_PASSWORD=…");
};

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
