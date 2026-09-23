/**
 * Display helpers. All money in this codebase is integer pesewas — these are the only
 * place it becomes a string, and it never becomes a float on the way.
 */

const GHS = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  minimumFractionDigits: 2,
});

/** 5000 → "GH₵50.00" */
export function formatPesewas(pesewas: number): string {
  return GHS.format(pesewas / 100);
}

/**
 * Events are shown in the venue's timezone, not the viewer's. Someone checking the page
 * from London must see the Accra door time, or they will arrive at the wrong hour.
 */
export function formatEventDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));
}

/** The calendar day at the venue, as `YYYY-MM-DD`. */
function venueDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/**
 * One date, or a span when the event runs across several days.
 *
 * `formatRange` collapses the parts the two dates share, so 7–9 October reads
 * "7 – 9 October 2026" rather than repeating the month and year. It also handles the
 * awkward cases — across a month or a new year — without a pile of conditionals here.
 *
 * Whether it spans is decided by the *calendar day at the venue*, not by elapsed hours:
 * a night that runs 9pm to 2am is one event, and would otherwise be advertised as two.
 */
export function formatEventDateRange(
  startsAt: string,
  endsAt: string | null,
  timeZone: string,
): string {
  if (!endsAt || venueDay(startsAt, timeZone) === venueDay(endsAt, timeZone)) {
    return formatEventDate(startsAt, timeZone);
  }

  // The weekday is dropped for a span — "Wednesday 7 – Friday 9 October" is a mouthful,
  // and the dates are what someone books travel around.
  return new Intl.DateTimeFormat("en-GH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).formatRange(new Date(startsAt), new Date(endsAt));
}

export function formatEventTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
    timeZoneName: "short",
  }).formatToParts(new Date(iso));

  // en-GH renders the meridiem lowercase ("8:00 pm"); a poster prints "8:00 PM".
  // Uppercasing just the dayPeriod part beats a regex over the whole string: the
  // separator ICU puts before it is a narrow no-break space, not the ASCII one.
  return parts
    .map((p) => (p.type === "dayPeriod" ? p.value.toUpperCase() : p.value))
    .join("");
}

/**
 * Date and time together, for audit trails — when a ticket was voided, when a message
 * last tried to send. Same reasoning as the event times: the venue's clock is the one
 * everyone on the team is working to on the night.
 */
export function formatTimestamp(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GH", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(new Date(iso));
}
