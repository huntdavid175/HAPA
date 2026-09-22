/**
 * Runs once when a server instance boots, before it accepts any request.
 *
 * Validating the environment here means a misconfigured deploy fails immediately and
 * visibly, rather than accepting a payment and then discovering the Paystack key is blank.
 */
export async function register() {
  // The Edge runtime does not see server-only vars, so only assert on Node.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEnv } = await import("./lib/env");
    assertEnv();
  }
}
