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

export function formatEventTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
    timeZoneName: "short",
  }).format(new Date(iso));
}
