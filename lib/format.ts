import type { Currency } from "@/lib/currency";

/**
 * Display helpers. All money in this codebase is integer minor units — pesewas for GHS,
 * cents for USD — and these are the only place it becomes a string. It never becomes a
 * float on the way.
 */

const formatters = new Map<Currency, Intl.NumberFormat>();

function formatter(currency: Currency): Intl.NumberFormat {
  let f = formatters.get(currency);
  if (!f) {
    // en-GH for both, so dollars print as "US$" — a bare "$" is ambiguous to a Ghanaian
    // buyer looking at a page that also shows cedis.
    f = new Intl.NumberFormat("en-GH", { style: "currency", currency, minimumFractionDigits: 2 });
    formatters.set(currency, f);
  }
  return f;
}

/** 5000 → "GH₵50.00"; 5000, "USD" → "US$50.00" */
export function formatPesewas(pesewas: number, currency: Currency = "GHS"): string {
  return formatter(currency).format(pesewas / 100);
}

/**
 * 35000 → { currency: "GH₵", amount: "350", fraction: ".00" }
 *
 * The same string as `formatPesewas`, in pieces, for layouts that set the amount larger
 * than the symbol and the pesewas. Comes from `formatToParts`, so it never disagrees with
 * the formatted string about grouping or the symbol.
 */
export function formatPesewasParts(pesewas: number, currency: Currency = "GHS") {
  let symbol = "";
  let amount = "";
  let fraction = "";
  for (const part of formatter(currency).formatToParts(pesewas / 100)) {
    if (part.type === "currency") symbol += part.value;
    else if (part.type === "integer" || part.type === "group") amount += part.value;
    else if (part.type === "decimal" || part.type === "fraction") fraction += part.value;
  }
  return { currency: symbol, amount, fraction };
}

/**
 * Totals across orders in different currencies, one string per currency — never summed
 * into one number, because cedis and dollars do not add up.
 * [{GHS, 5000}, {USD, 2000}, {GHS, 1000}] → "GH₵60.00 + US$20.00"
 */
export function formatTotals(rows: { pesewas: number; currency: Currency }[]): string {
  const sums = new Map<Currency, number>();
  for (const row of rows) sums.set(row.currency, (sums.get(row.currency) ?? 0) + row.pesewas);
  if (sums.size === 0) return formatPesewas(0);
  return [...sums].map(([currency, total]) => formatPesewas(total, currency)).join(" + ");
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

/**
 * "just now", "12 min ago", "3 hr ago", "yesterday", then a plain date.
 *
 * For lists whose point is recency, like the dashboard's recent purchases, where "12 min
 * ago" answers the question at a glance and "24 Sept, 11:44 pm" makes you do the sum.
 * Past a week the gap stops meaning anything, so it falls back to the date in the venue's
 * timezone. Rendered on the server per request, so it never drifts on a stale tab.
 */
export function formatRelativeTime(iso: string, timeZone: string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  return new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "short", timeZone }).format(
    new Date(iso),
  );
}
