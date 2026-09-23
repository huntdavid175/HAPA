import { formatPesewas } from "@/lib/format";
import type { TierWithAvailability } from "@/lib/events";

/** Only show a count when it is low enough to actually mean something. */
const SCARCITY_THRESHOLD = 20;

function statusLabel(tier: TierWithAvailability) {
  switch (tier.unavailableReason) {
    case "sold_out":
      return { text: "Sold out", tone: "muted" as const };
    case "not_yet_on_sale":
      return { text: "Not on sale yet", tone: "muted" as const };
    case "sales_ended":
      return { text: "Sales closed", tone: "muted" as const };
    default:
      return tier.available <= SCARCITY_THRESHOLD
        ? { text: `Only ${tier.available} left`, tone: "warning" as const }
        : { text: "On sale", tone: "success" as const };
  }
}

/**
 * One tier, shaped like the thing it sells.
 *
 * The perforation is the divider between the description and the price, so no extra rule
 * is needed — the structure carries the meaning instead of decorating it. The seam's
 * position lives in one CSS variable so the column and the punched notches stay aligned.
 */
export function TierCard({ tier }: { tier: TierWithAvailability }) {
  const unavailable = tier.unavailableReason !== null;
  const status = statusLabel(tier);

  return (
    <li
      className={`stub grid grid-cols-[minmax(0,1fr)_var(--stub-width)] border border-border bg-card ${
        unavailable ? "opacity-55" : ""
      }`}
    >
      <div className="p-5">
        <h3 className="text-lg leading-tight font-bold [font-stretch:105%]">{tier.name}</h3>

        {tier.description ? (
          <p className="mt-1.5 text-sm text-muted-foreground">{tier.description}</p>
        ) : null}

        <p
          className={`mt-3 text-sm font-medium ${
            status.tone === "warning"
              ? "text-warning"
              : status.tone === "success"
                ? "text-success"
                : "text-muted-foreground"
          }`}
        >
          {status.text}
        </p>
      </div>

      <div className="flex flex-col items-center justify-center border-l-2 border-dashed border-border p-3 text-center">
        <p className="text-base leading-none font-extrabold tabular-nums">
          {formatPesewas(tier.price_pesewas)}
        </p>
      </div>
    </li>
  );
}
