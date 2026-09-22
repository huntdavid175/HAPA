/**
 * Conversions between a `datetime-local` input (wall-clock, no zone) and a UTC instant.
 *
 * The organizer types the time at the venue. If that were ever interpreted in the
 * server's zone, every ticket would carry the wrong door time — and on Vercel the
 * server's zone is not something we control. So both directions are explicit about the
 * event's timezone, and they must round-trip exactly.
 */

/** "2026-10-22T20:00" + "Africa/Accra" → "2026-10-22T20:00:00.000Z" */
export function localInputToUtcIso(local: string, timeZone: string): string {
  const naive = new Date(`${local}:00Z`);
  if (Number.isNaN(naive.getTime())) {
    throw new Error(`Invalid date and time: ${local}`);
  }

  // Treat the wall-clock string as if it were UTC, measure how far that instant sits
  // from the target zone, then shift by that offset. Doing it against the parsed instant
  // (rather than "now") keeps DST correct for zones that observe it.
  const asUtc = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
  const asZone = new Date(naive.toLocaleString("en-US", { timeZone }));
  return new Date(naive.getTime() + (asUtc.getTime() - asZone.getTime())).toISOString();
}

/** "2026-10-22T20:00:00.000Z" + "Africa/Accra" → "2026-10-22T20:00" */
export function utcIsoToLocalInput(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  // en-CA reports midnight as hour "24"; datetime-local needs "00".
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}
