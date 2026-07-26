import Link from "next/link";
import { getT } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { numberField } from "@/lib/json";
import { cn } from "@/lib/utils";
import { Badge, Card, CardHeader } from "./ui";

export type AuditHistoryRow = {
  id: string;
  status: string;
  score: number | null;
  triggeredBy: string;
  createdAt: Date;
  finishedAt: Date | null;
  error: string | null;
  aiMeta: unknown;
  findingCount: number;
};

const STATUS_TONE: Record<string, "neutral" | "positive" | "negative" | "accent"> = {
  done: "positive",
  running: "accent",
  queued: "neutral",
  failed: "negative",
};

function stamp(value: Date): string {
  return value.toISOString().replace("T", " ").slice(0, 16);
}

/** Wall-clock length of the run, which is what makes a slow crawl visible. */
function duration(from: Date, to: Date | null): string | null {
  if (!to) return null;
  const seconds = Math.round((to.getTime() - from.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/**
 * Every run, not just the newest.
 *
 * The audit page previously read only the latest completed audit, so failures
 * and the run currently in progress were invisible even though both were
 * already in the database — a failed audit looked like nothing had happened.
 */
export async function AuditHistory({
  rows,
  basePath,
  selectedId,
}: {
  rows: AuditHistoryRow[];
  basePath: string;
  selectedId: string;
}) {
  const { t } = await getT();

  return (
    <Card>
      <CardHeader
        title={t.seo.history}
        hint={fmt(t.seo.runCount, { n: rows.length }, rows.length)}
      />

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">{t.seo.noRuns}</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {rows.map((row) => {
            const selected = row.id === selectedId;
            const cost = numberField(row.aiMeta, "costUsd");
            const took = duration(row.createdAt, row.finishedAt);
            // Only completed runs have anything to show.
            const viewable = row.status === "done";

            const body = (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span className="tnum text-sm font-medium">{stamp(row.createdAt)}</span>
                  <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>
                    {t.seo.statuses[row.status as keyof typeof t.seo.statuses] ?? row.status}
                  </Badge>
                  <Badge>
                    {t.seo.triggers[row.triggeredBy as keyof typeof t.seo.triggers] ??
                      row.triggeredBy}
                  </Badge>
                  {row.score !== null ? (
                    <span className="tnum text-sm">{fmt(t.seo.scoreLabel, { score: row.score })}</span>
                  ) : null}
                </div>

                <p className="mt-1 text-xs text-muted">
                  {[
                    fmt(t.seo.findingCount, { n: row.findingCount }, row.findingCount),
                    took ? fmt(t.seo.took, { took }) : null,
                    // A run that cost nothing was a rule-only run; saying "$0.00"
                    // would read as a billing figure rather than "no AI ran".
                    cost ? `$${cost.toFixed(4)}` : t.seo.rulesOnly,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>

                {row.error ? (
                  <p className="mt-1 line-clamp-2 text-xs text-neg">{row.error}</p>
                ) : null}
              </>
            );

            return (
              <li key={row.id}>
                {viewable ? (
                  <Link
                    href={`${basePath}?audit=${row.id}`}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "block px-5 py-3 transition-colors hover:bg-panel-alt",
                      selected && "bg-accent-soft/40",
                    )}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="px-5 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
