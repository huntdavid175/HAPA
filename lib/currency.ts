/**
 * The currencies a tier can be priced in. Mirrors the `tiers_currency_supported` and
 * `orders_currency_supported` CHECK constraints — widen those first, then this.
 *
 * Both have a 1/100 minor unit (pesewas, cents), which is what every `_pesewas` amount
 * in the codebase actually holds: the minor unit of its row's currency.
 */
export const CURRENCIES = ["GHS", "USD"] as const;

export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_LABELS: Record<Currency, string> = {
  GHS: "Ghana cedi (GH₵)",
  USD: "US dollar (US$)",
};

/** Matches what `formatPesewas` prints, for labels that sit beside a bare number. */
export const CURRENCY_SYMBOLS: Record<Currency, string> = { GHS: "GH₵", USD: "US$" };

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

/** Rows from the database are `string`; anything unexpected is treated as cedis. */
export function toCurrency(value: string | null | undefined): Currency {
  return isCurrency(value) ? value : "GHS";
}
