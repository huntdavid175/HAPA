/**
 * Round-trip checks for the event date/time conversions.
 *
 * A bug here shifts the door time on every ticket without erroring, so it gets its own
 * check. Includes a DST zone even though Ghana has none — the organizer can set any
 * timezone on the event, and Accra being permanently GMT would hide an offset bug.
 *
 * Run:  npm run check:datetime
 */
import { localInputToUtcIso, utcIsoToLocalInput } from "../lib/datetime.ts";

let failures = 0;

function check(name: string, actual: string, expected: string) {
  const pass = actual === expected;
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) console.log(`        expected ${expected}\n        actual   ${actual}`);
}

console.log("\nLocal input → UTC");
check("Accra 20:00 is GMT, so UTC is the same",
  localInputToUtcIso("2026-10-22T20:00", "Africa/Accra"), "2026-10-22T20:00:00.000Z");
check("Lagos is UTC+1",
  localInputToUtcIso("2026-10-22T20:00", "Africa/Lagos"), "2026-10-22T19:00:00.000Z");
check("Nairobi is UTC+3",
  localInputToUtcIso("2026-10-22T20:00", "Africa/Nairobi"), "2026-10-22T17:00:00.000Z");
check("New York in October is UTC-4 (DST)",
  localInputToUtcIso("2026-10-22T20:00", "America/New_York"), "2026-10-23T00:00:00.000Z");
check("New York in January is UTC-5 (no DST)",
  localInputToUtcIso("2026-01-22T20:00", "America/New_York"), "2026-01-23T01:00:00.000Z");
check("midnight does not roll to the previous day",
  localInputToUtcIso("2026-10-22T00:00", "Africa/Accra"), "2026-10-22T00:00:00.000Z");

console.log("\nUTC → local input");
check("Accra", utcIsoToLocalInput("2026-10-22T20:00:00.000Z", "Africa/Accra"), "2026-10-22T20:00");
check("Lagos", utcIsoToLocalInput("2026-10-22T19:00:00.000Z", "Africa/Lagos"), "2026-10-22T20:00");
check("midnight renders as 00:00, not 24:00",
  utcIsoToLocalInput("2026-10-22T00:00:00.000Z", "Africa/Accra"), "2026-10-22T00:00");

console.log("\nRound trip (edit the form, save, reopen it)");
for (const tz of ["Africa/Accra", "Africa/Lagos", "America/New_York", "Asia/Kolkata", "Pacific/Auckland"]) {
  for (const local of ["2026-10-22T20:00", "2026-01-05T00:00", "2026-06-30T23:59"]) {
    const back = utcIsoToLocalInput(localInputToUtcIso(local, tz), tz);
    check(`${tz} ${local}`, back, local);
  }
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
