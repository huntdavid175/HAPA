import { toCurrency, type Currency } from "@/lib/currency";

export type Price = { pesewas: number; currency: Currency };

/**
 * The "from" price shown before a buyer has chosen anything.
 *
 * Cedi and dollar prices cannot be compared, so this is the cheapest tier in cedis when
 * there is one — most buyers pay in cedis — and the cheapest in dollars otherwise. The
 * cards list every tier in its own currency; this is only the teaser.
 */
export function cheapestPrice(
  tiers: { price_pesewas: number; currency: string }[],
): Price | null {
  const priced = tiers.map((t) => ({ pesewas: t.price_pesewas, currency: toCurrency(t.currency) }));
  const pool = priced.some((p) => p.currency === "GHS")
    ? priced.filter((p) => p.currency === "GHS")
    : priced;
  if (pool.length === 0) return null;
  return pool.reduce((min, p) => (p.pesewas < min.pesewas ? p : min));
}
