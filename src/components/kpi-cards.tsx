import type { Metrics } from "@/lib/gsc-queries";
import { cn, formatNumber, formatPercent, formatPosition } from "@/lib/utils";
import { Card } from "./ui";

type Kpi = {
  label: string;
  value: string;
  delta: string | null;
  /** null when there is nothing to compare against */
  direction: "up" | "down" | "flat" | null;
  /** For average position, a *lower* number is the good outcome. */
  lowerIsBetter?: boolean;
};

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

function signed(value: number, format: (v: number) => string): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${format(Math.abs(value))}`;
}

function buildKpis(totals: Metrics, previous: Metrics | null): Kpi[] {
  const ratio = (current: number, prev: number): Pick<Kpi, "delta" | "direction"> => {
    if (!previous) return { delta: null, direction: null };
    const change = pctChange(current, prev);
    if (change === null) return { delta: "new", direction: "up" };
    return {
      delta: signed(change, (v) => `${(v * 100).toFixed(1)}%`),
      direction: change > 0 ? "up" : change < 0 ? "down" : "flat",
    };
  };

  return [
    {
      label: "Clicks",
      value: formatNumber(totals.clicks),
      ...ratio(totals.clicks, previous?.clicks ?? 0),
    },
    {
      label: "Impressions",
      value: formatNumber(totals.impressions),
      ...ratio(totals.impressions, previous?.impressions ?? 0),
    },
    {
      label: "CTR",
      value: formatPercent(totals.ctr),
      // Percentage points, not a relative change — a CTR going 1% -> 2% is
      // "+1.00pt", which is what people actually reason about.
      ...(previous
        ? (() => {
            const points = (totals.ctr - previous.ctr) * 100;
            return {
              delta: signed(points, (v) => `${v.toFixed(2)}pt`),
              direction:
                points > 0 ? ("up" as const) : points < 0 ? ("down" as const) : ("flat" as const),
            };
          })()
        : { delta: null, direction: null }),
    },
    {
      label: "Avg. position",
      value: formatPosition(totals.position),
      lowerIsBetter: true,
      ...(previous
        ? (() => {
            const change = totals.position - previous.position;
            return {
              delta: signed(change, (v) => v.toFixed(1)),
              direction:
                change > 0 ? ("up" as const) : change < 0 ? ("down" as const) : ("flat" as const),
            };
          })()
        : { delta: null, direction: null }),
    },
  ];
}

export function KpiCards({
  totals,
  previousTotals,
}: {
  totals: Metrics;
  previousTotals: Metrics | null;
}) {
  const kpis = buildKpis(totals, previousTotals);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((kpi) => {
        const isGood =
          kpi.direction === "flat" || kpi.direction === null
            ? null
            : kpi.lowerIsBetter
              ? kpi.direction === "down"
              : kpi.direction === "up";

        return (
          <Card key={kpi.label} className="px-5 py-4">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              {kpi.label}
            </p>
            <p className="tnum mt-2 text-2xl font-semibold">{kpi.value}</p>
            <p
              className={cn(
                "tnum mt-1 text-xs",
                isGood === null && "text-muted",
                isGood === true && "text-pos",
                isGood === false && "text-neg",
              )}
            >
              {kpi.delta ? (
                <>
                  {kpi.direction === "up" ? "▲" : kpi.direction === "down" ? "▼" : "—"}{" "}
                  {kpi.delta}
                  <span className="text-muted"> vs. previous</span>
                </>
              ) : (
                "no comparison data"
              )}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
