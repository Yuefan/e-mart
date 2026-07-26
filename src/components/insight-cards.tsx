import type { Insight, Insights } from "@/lib/gsc-queries";
import { getT } from "@/lib/i18n";
import { formatNumber, formatPercent, formatPosition, shortenUrl } from "@/lib/utils";
import { Card, CardHeader } from "./ui";

type Panel = {
  title: string;
  hint: string;
  rows: Insight[];
  kind: "query" | "page";
  /** Right-hand metric that justifies the row being here. */
  metric: (row: Insight) => string;
};

/**
 * Derived locally from data already on screen — no extra API call, no AI.
 * These three lists are also the seeds for the SEO audit and content modules.
 */
export async function InsightCards({ insights }: { insights: Insights }) {
  const { t } = await getT();

  const panels: Panel[] = [
    {
      title: t.overview.insights.opportunity,
      hint: t.overview.insights.opportunityHint,
      rows: insights.opportunityQueries,
      kind: "query",
      metric: (row) =>
        `${formatPercent(row.ctr, 2)} ${t.overview.ctr} · ${t.overview.posPrefix} ${formatPosition(row.position)}`,
    },
    {
      title: t.overview.insights.striking,
      hint: t.overview.insights.strikingHint,
      rows: insights.strikingDistancePages,
      kind: "page",
      metric: (row) => `${t.overview.posPrefix} ${formatPosition(row.position)}`,
    },
    {
      title: t.overview.insights.declining,
      hint: t.overview.insights.decliningHint,
      rows: insights.decliningPages,
      kind: "page",
      metric: (row) =>
        `${formatNumber(row.deltaClicks ?? 0)} ${t.overview.insights.clicksSuffix}`,
    },
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {panels.map((panel) => (
        <Card key={panel.title} className="flex flex-col">
          <CardHeader title={panel.title} hint={panel.hint} />
          {panel.rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              {t.overview.insights.nothingFlagged}
            </p>
          ) : (
            <ul className="divide-y divide-line/60">
              {panel.rows.slice(0, 6).map((row) => (
                <li key={row.value} className="flex items-baseline gap-3 px-5 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm" title={row.value}>
                    {panel.kind === "page" ? shortenUrl(row.value) : row.value}
                  </span>
                  <span className="tnum shrink-0 text-xs text-muted">{panel.metric(row)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
