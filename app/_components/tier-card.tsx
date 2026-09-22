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
        : { text: "Available", tone: "success" as const };
  }
}

export function TierCard({ tier }: { tier: TierWithAvailability }) {
  const unavailable = tier.unavailableReason !== null;
  const status = statusLabel(tier);

  return (
    <li
      className={`rounded-xl border border-border bg-card p-4 transition-opacity sm:p-5 ${
        unavailable ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold sm:text-lg">{tier.name}</h3>
          {tier.description ? (
            <p className="mt-1 text-sm text-muted">{tier.description}</p>
          ) : null}
        </div>
        <p className="shrink-0 text-right text-base font-semibold tabular-nums sm:text-lg">
          {formatPesewas(tier.price_pesewas)}
        </p>
      </div>

      <p
        className={`mt-3 text-sm font-medium ${
          status.tone === "warning"
            ? "text-warning"
            : status.tone === "success"
              ? "text-success"
              : "text-muted"
        }`}
      >
        {status.text}
      </p>
    </li>
  );
}
