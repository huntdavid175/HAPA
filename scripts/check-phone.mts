/**
 * Phone normalization checks.
 *
 * Buyers type their number the way they say it. Every accepted form must land on the same
 * E.164 string, because that string is both the delivery address and the key the abuse
 * guard groups holds by.
 *
 * Run:  npm run check:phone
 */
import { normalizeGhanaPhone, formatGhanaPhone } from "../lib/phone.ts";

let failures = 0;

function accepts(input: string, expected: string) {
  const result = normalizeGhanaPhone(input);
  const actual = result.ok ? result.e164 : `REJECTED: ${result.error}`;
  const pass = actual === expected;
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${JSON.stringify(input).padEnd(22)} → ${actual}`);
}

function rejects(input: string, why: string) {
  const result = normalizeGhanaPhone(input);
  const pass = !result.ok;
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  rejects ${JSON.stringify(input).padEnd(22)} (${why})`);
}

console.log("\nThe same MTN number, however it is typed");
for (const form of [
  "0241234567", "024 123 4567", "024-123-4567", "+233241234567",
  "+233 24 123 4567", "233241234567", "241234567", " 0241234567 ",
  "(024) 123 4567",
]) {
  accepts(form, "+233241234567");
}

console.log("\nOther Ghanaian networks");
accepts("0201234567", "+233201234567");  // Telecel
accepts("0501234567", "+233501234567");  // Telecel
accepts("0541234567", "+233541234567");  // MTN
accepts("0271234567", "+233271234567");  // AirtelTigo
accepts("0561234567", "+233561234567");  // AirtelTigo

console.log("\nRejections");
rejects("", "empty");
rejects("024123456", "too short");
rejects("02412345678", "too long");
rejects("0121234567", "not a mobile prefix");
rejects("+447700900123", "UK number — cannot deliver via a Ghana sender ID");
rejects("024 ABC 4567", "letters");
rejects("+1 555 0100", "US number");

console.log("\nDisplay format");
const shown = formatGhanaPhone("+233241234567");
const ok = shown === "024 123 4567";
if (!ok) failures++;
console.log(`  ${ok ? "PASS" : "FAIL"}  +233241234567 → ${shown}`);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
