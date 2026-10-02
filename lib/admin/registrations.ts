import "server-only";

import { REGISTRATION_DAYS } from "@/lib/registration-days";

/** A night tab: "all", or a night's number as it appears in `?day=`. */
export type DayFilter = "all" | 1 | 2 | 3;

export function parseDayFilter(value: unknown): DayFilter {
  const n = Number(value);
  return REGISTRATION_DAYS.some((d) => d.number === n) ? (n as 1 | 2 | 3) : "all";
}

/**
 * The PostgREST `or()` filter for a search box, shared by the list and its CSV so the
 * export always holds exactly what the page showed.
 *
 * Matches any column, plus two cases a single column cannot: "Ama Mensah" across first and
 * last name, and a phone number typed the way it is said (024 123 4567), when the column
 * holds +233241234567.
 */
export function registrationSearchFilter(query: string): string | null {
  if (!query) return null;

  // Strip PostgREST's or() delimiters so a comma or paren can't alter the expression.
  const safe = query.replace(/[,()]/g, " ").trim();
  if (!safe) return null;

  const parts = ["first_name", "last_name", "email", "phone", "occupation", "invited_by"].map(
    (column) => `${column}.ilike.%${safe}%`,
  );

  const words = safe.split(/\s+/);
  if (words.length >= 2) {
    const last = words.pop()!;
    parts.push(`and(first_name.ilike.%${words.join(" ")}%,last_name.ilike.%${last}%)`);
  }

  const digits = safe.replace(/\D/g, "").replace(/^0/, "");
  if (digits.length >= 4) parts.push(`phone.ilike.%${digits}%`);

  return parts.join(",");
}
