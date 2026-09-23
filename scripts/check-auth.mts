/**
 * End-to-end check of the role split against the running dev server.
 *
 * Signs in for real with supabase-js, then rebuilds the session cookie exactly as
 * @supabase/ssr writes it (`base64-` + base64url JSON, chunked at 3180 encoded chars as
 * `<key>.<n>`) so requests arrive authenticated. Verifying this by hand in a browser is
 * easy to get wrong and easy to skip; this makes it repeatable.
 *
 * Run:  npm run check:auth
 */
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// Emails are overridable so the suite can run against throwaway accounts provisioned for
// one run, rather than requiring the seeded passwords to be kept somewhere.
const ADMIN = {
  email: process.env.CHECK_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.CHECK_ADMIN_PASSWORD!,
};
const STAFF = {
  email: process.env.CHECK_STAFF_EMAIL ?? "staff@example.com",
  password: process.env.CHECK_STAFF_PASSWORD!,
};

const MAX_CHUNK = 3180;
const projectRef = new URL(url).hostname.split(".")[0];
const storageKey = `sb-${projectRef}-auth-token`;

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function sessionCookie(session: unknown): string {
  const value = `base64-${base64url(JSON.stringify(session))}`;
  const encoded = encodeURIComponent(value);

  if (encoded.length <= MAX_CHUNK) return `${storageKey}=${encoded}`;

  // Mirror createChunks: split the *encoded* string, then re-encode each decoded piece.
  const parts: string[] = [];
  let rest = encoded;
  while (rest.length > 0) {
    let head = rest.slice(0, MAX_CHUNK);
    const lastEscape = head.lastIndexOf("%");
    if (lastEscape > MAX_CHUNK - 3) head = head.slice(0, lastEscape);
    parts.push(head);
    rest = rest.slice(head.length);
  }
  return parts.map((p, i) => `${storageKey}.${i}=${p}`).join("; ");
}

async function signIn(creds: { email: string; password: string }) {
  const supabase = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword(creds);
  if (error) throw new Error(`sign-in failed for ${creds.email}: ${error.message}`);
  return sessionCookie(data.session);
}

// A well-formed id that matches no order. Admin should therefore reach the page and get
// a 404 from it; door staff should never get that far. Both outcomes are assertions: a
// redirect for admin would mean the gate is too tight, a 404 for staff too loose.
const ABSENT_ORDER = "00000000-0000-4000-8000-000000000000";

type Expect = { path: string; expect: number | "redirect"; note: string };

async function probe(cookie: string | null, cases: Expect[], who: string) {
  console.log(`\n${who}`);
  let failures = 0;

  for (const c of cases) {
    const res = await fetch(`${BASE}${c.path}`, {
      redirect: "manual",
      headers: cookie ? { cookie } : {},
    });
    const location = res.headers.get("location") ?? "";
    const isRedirect = res.status >= 300 && res.status < 400;
    const pass =
      c.expect === "redirect" ? isRedirect : res.status === c.expect && !isRedirect;

    if (!pass) failures++;
    const detail = isRedirect ? `${res.status} -> ${location}` : String(res.status);
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${c.path.padEnd(46)} ${detail.padEnd(28)} ${c.note}`);
  }
  return failures;
}

const main = async () => {
  if (!ADMIN.password || !STAFF.password) {
    console.error("Set CHECK_ADMIN_PASSWORD and CHECK_STAFF_PASSWORD.");
    process.exit(1);
  }

  let failures = 0;

  failures += await probe(null, [
    { path: "/", expect: 200, note: "public event page is open to everyone" },
    { path: "/admin", expect: "redirect", note: "signed-out admin is bounced" },
    { path: "/admin/buyers", expect: "redirect", note: "signed-out buyers list is bounced" },
    { path: "/admin/buyers/export", expect: "redirect", note: "CSV route is bounced" },
    { path: "/admin/failures", expect: "redirect", note: "signed-out failure list is bounced" },
    { path: "/scan", expect: "redirect", note: "signed-out gate is bounced" },
  ], "Signed out");

  const adminCookie = await signIn(ADMIN);
  failures += await probe(adminCookie, [
    { path: "/admin", expect: 200, note: "admin reaches the dashboard" },
    { path: "/admin/buyers", expect: 200, note: "admin reaches the buyer list" },
    { path: "/admin/event", expect: 200, note: "admin reaches event settings" },
    { path: "/admin/staff", expect: 200, note: "admin reaches staff accounts" },
    { path: "/admin/buyers/export", expect: 200, note: "admin can export CSV" },
    { path: "/admin/failures", expect: 200, note: "admin reaches the failure list" },
    {
      path: `/admin/orders/${ABSENT_ORDER}`,
      expect: 404,
      note: "admin passes the gate on order detail (404 = no such order)",
    },
    { path: "/scan", expect: 200, note: "admin can also work the gate" },
  ], `Admin (${ADMIN.email})`);

  const staffCookie = await signIn(STAFF);
  failures += await probe(staffCookie, [
    { path: "/scan", expect: 200, note: "door staff reach the gate" },
    { path: "/admin", expect: "redirect", note: "DOOR STAFF MUST NOT SEE THE DASHBOARD" },
    { path: "/admin/buyers", expect: "redirect", note: "DOOR STAFF MUST NOT SEE BUYERS" },
    { path: "/admin/staff", expect: "redirect", note: "DOOR STAFF MUST NOT MANAGE ACCOUNTS" },
    { path: "/admin/buyers/export", expect: 404, note: "CSV route re-checks role itself" },
    { path: "/admin/failures", expect: "redirect", note: "DOOR STAFF MUST NOT SEE FAILURES" },
    {
      path: `/admin/orders/${ABSENT_ORDER}`,
      expect: "redirect",
      note: "DOOR STAFF MUST NOT SEE ORDER DETAIL",
    },
  ], `Door staff (${STAFF.email})`);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
