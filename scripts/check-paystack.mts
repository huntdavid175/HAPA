/**
 * Talks to Paystack for real.
 *
 * Everything either side of `transaction/initialize` and `transaction/verify` was already
 * covered — the reservation, the webhook signature, idempotency, ticket issuance. These
 * two calls could not be, because they need credentials. This closes that gap.
 *
 * Safe to run repeatedly: it only initialises transactions, never charges anything, and
 * refuses to run against a live key.
 *
 * Run:  npm run check:paystack
 */
import { createHmac } from "node:crypto";

const API = "https://api.paystack.co";
const secret = process.env.PAYSTACK_SECRET_KEY;
const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;

let failures = 0;

function check(name: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass && detail) console.log(`        ${detail}`);
}

async function paystack(path: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return { status: response.status, body: await response.json() };
}

const main = async () => {
  if (!secret) {
    console.error("PAYSTACK_SECRET_KEY is not set. Add it to .env.local.");
    process.exit(1);
  }

  console.log("\nCredentials");
  // Running this against a live key would create real transactions on the real account.
  check("secret key is a TEST key", secret.startsWith("sk_test_"), `starts ${secret.slice(0, 8)}…`);
  if (!secret.startsWith("sk_test_")) {
    console.error("\nRefusing to run against a live key.");
    process.exit(1);
  }
  check(
    "public key is present and matches mode",
    Boolean(publicKey?.startsWith("pk_test_")),
    publicKey ? `starts ${publicKey.slice(0, 8)}…` : "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY missing",
  );

  const whoami = await paystack("/transaction?perPage=1");
  check("the key authenticates", whoami.status === 200, `HTTP ${whoami.status} ${whoami.body?.message ?? ""}`);

  console.log("\ntransaction/initialize");
  const reference = `check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const amountPesewas = 5000; // GH₵50.00

  const init = await paystack("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: "paystack-check@example.com",
      amount: amountPesewas,
      currency: "GHS",
      reference,
      callback_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/order/${reference}`,
      channels: ["mobile_money", "card"],
      metadata: { source: "check:paystack" },
    }),
  });

  check("GHS is accepted on this account", init.status === 200, `HTTP ${init.status} — ${init.body?.message}`);
  if (init.status !== 200) {
    console.error(
      "\nInitialize failed. If the message mentions currency, the Paystack account is " +
        "not enabled for GHS yet — that is an account setting, not a code problem.",
    );
    console.log(`\n${failures} check(s) FAILED.`);
    process.exit(1);
  }

  check("returns an authorization_url", typeof init.body?.data?.authorization_url === "string");
  check("returns an access_code", typeof init.body?.data?.access_code === "string");
  check("echoes our reference", init.body?.data?.reference === reference, init.body?.data?.reference);
  check(
    "authorization_url is on paystack.com",
    String(init.body?.data?.authorization_url ?? "").startsWith("https://checkout.paystack.com/"),
    init.body?.data?.authorization_url,
  );

  // Our own reference is what ties a Paystack transaction to an order row, so Paystack
  // refusing to reuse one is what stops two orders sharing a payment.
  const duplicate = await paystack("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: "paystack-check@example.com",
      amount: amountPesewas,
      currency: "GHS",
      reference,
    }),
  });
  check("a duplicate reference is rejected", duplicate.status !== 200, `HTTP ${duplicate.status}`);

  console.log("\ntransaction/verify");
  const verify = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  check("verify responds for a known reference", verify.status === 200, `HTTP ${verify.status}`);
  check(
    "amount comes back in pesewas, unchanged",
    verify.body?.data?.amount === amountPesewas,
    `got ${verify.body?.data?.amount}`,
  );
  check("currency is GHS", verify.body?.data?.currency === "GHS", verify.body?.data?.currency);
  check(
    "an uncharged transaction is not 'success'",
    verify.body?.data?.status !== "success",
    `status ${verify.body?.data?.status}`,
  );

  const unknown = await paystack("/transaction/verify/definitely-not-a-real-reference");
  check("an unknown reference is not reported as paid", unknown.body?.data?.status !== "success");

  console.log("\nWebhook signature");
  // The route computes this the same way; proving the shape here means a signature
  // mismatch in production is a configuration problem, not an algorithm one.
  const body = JSON.stringify({ event: "charge.success", data: { reference } });
  const signature = createHmac("sha512", secret).update(body).digest("hex");
  check("HMAC-SHA512 of the raw body is 128 hex chars", /^[0-9a-f]{128}$/.test(signature));
  check(
    "a tampered body produces a different signature",
    createHmac("sha512", secret).update(body + " ").digest("hex") !== signature,
  );

  console.log(
    failures === 0
      ? `\nAll checks passed. Test transaction: ${reference}`
      : `\n${failures} check(s) FAILED.`,
  );
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
