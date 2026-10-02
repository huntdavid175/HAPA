/**
 * Moolre connectivity check: are the credentials in .env.local accepted, and do the two
 * calls checkout depends on answer the way lib/moolre.ts expects?
 *
 *   1. create a GH₵1 payment link that expires in one minute (nobody pays it)
 *   2. ask the status endpoint about that reference — it must not report it as paid
 *
 * Prints what Moolre actually returned, so the first run against a real account doubles
 * as a record of the response shapes. Safe against live too: an unpaid link that expires
 * a minute later moves no money.
 *
 * Run:  npm run check:moolre
 */

const env = (name: string) => process.env[name]?.trim() || undefined;

const apiUrl = env("MOOLRE_API_URL");
const user = env("MOOLRE_API_USER");
const pubKey = env("MOOLRE_API_PUBKEY");
const accountNumber = env("MOOLRE_ACCOUNT_NUMBER");
const merchantEmail = env("MOOLRE_MERCHANT_EMAIL");
const site = env("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000";

async function call(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: {
      "X-API-USER": user!,
      "X-API-PUBKEY": pubKey!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    // shown raw below
  }
  return { http: response.status, json, text };
}

async function main() {
  const missing = Object.entries({
    MOOLRE_API_URL: apiUrl,
    MOOLRE_API_USER: user,
    MOOLRE_API_PUBKEY: pubKey,
    MOOLRE_ACCOUNT_NUMBER: accountNumber,
    MOOLRE_MERCHANT_EMAIL: merchantEmail,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    console.error(`Missing in .env.local: ${missing.join(", ")}`);
    process.exit(1);
  }

  const environment = apiUrl!.includes("sandbox") ? "SANDBOX" : "LIVE";
  console.log(`\nMoolre ${environment} at ${apiUrl}, user ${user}, account ${accountNumber}`);

  const reference = `hapa_check_${Date.now().toString(36)}`;

  console.log("\n1. Generate payment link (GH₵1.00, expires in 1 minute)");
  const link = await call("/embed/link", {
    type: 1,
    amount: "1.00",
    currency: "GHS",
    accountnumber: accountNumber,
    email: merchantEmail,
    externalref: reference,
    callback: `${site}/api/webhooks/moolre`,
    redirect: `${site}/order/${reference}`,
    reusable: "0",
    expiration_time: 1,
    metadata: { reference, check: true },
  });
  console.log(`   HTTP ${link.http}`, link.json ?? link.text);
  const url = (link.json?.data as { authorization_url?: string } | undefined)?.authorization_url;
  if (link.json?.status !== 1 || !url) {
    console.error("\n   FAIL: no payment link. Check the credentials and account number.");
    process.exit(1);
  }
  console.log(`   PASS: ${url}`);

  console.log("\n2. Payment status for that reference (must not be paid)");
  const status = await call("/open/transact/status", {
    type: 1,
    idtype: 1,
    id: reference,
    accountnumber: accountNumber,
  });
  console.log(`   HTTP ${status.http}`, status.json ?? status.text);
  const txstatus = (status.json?.data as { txstatus?: unknown } | undefined)?.txstatus;
  const paid = status.json?.status === 1 && Number(txstatus) === 1;
  if (paid) {
    console.error("\n   FAIL: an unpaid link reads as paid — lib/moolre.ts would issue tickets for it.");
    process.exit(1);
  }
  console.log("   PASS: not reported as paid");

  console.log("\nMoolre answered as expected.");
}

main().catch((err) => {
  console.error("\nCheck failed:", err.message ?? err);
  process.exit(1);
});
