import type { Finding } from "@prisma/client";
import Link from "next/link";
import { CATEGORIES, SEVERITIES } from "@/lib/ai/schemas";
import { cn, shortenUrl } from "@/lib/utils";
import { Badge, Card, CardHeader } from "./ui";

const SEVERITY_TONE: Record<string, { label: string; className: string }> = {
  critical: { label: "Critical", className: "text-neg" },
  high: { label: "High", className: "text-neg" },
  medium: { label: "Medium", className: "text-accent" },
  low: { label: "Low", className: "text-muted" },
};

function FilterLinks({
  basePath,
  param,
  values,
  active,
  allLabel,
  preserve,
}: {
  basePath: string;
  param: string;
  values: readonly string[];
  active: string | null;
  allLabel: string;
  preserve: Record<string, string>;
}) {
  const href = (value: string | null) => {
    const params = new URLSearchParams(preserve);
    if (value) params.set(param, value);
    else params.delete(param);
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  return (
    <div className="flex flex-wrap gap-1">
      <Link
        href={href(null)}
        className={cn(
          "rounded-md px-2 py-1 text-xs font-medium transition-colors",
          active === null ? "bg-panel-alt text-fg" : "text-muted hover:text-fg",
        )}
      >
        {allLabel}
      </Link>
      {values.map((value) => (
        <Link
          key={value}
          href={href(value)}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors",
            active === value ? "bg-panel-alt text-fg" : "text-muted hover:text-fg",
          )}
        >
          {value}
        </Link>
      ))}
    </div>
  );
}

export function FindingsList({
  findings,
  basePath,
  severity,
  category,
  total,
}: {
  findings: Finding[];
  basePath: string;
  severity: string | null;
  category: string | null;
  total: number;
}) {
  const preserve: Record<string, string> = {};
  if (severity) preserve.severity = severity;
  if (category) preserve.category = category;

  // Grouped by severity so the worst problems are read first, per spec §5.2.
  const grouped = SEVERITIES.map((level) => ({
    level,
    rows: findings.filter((f) => f.severity === level),
  })).filter((group) => group.rows.length > 0);

  return (
    <Card>
      <CardHeader
        title="Findings"
        hint={
          findings.length === total
            ? `${total} total`
            : `${findings.length} of ${total} shown`
        }
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Severity</span>
          <FilterLinks
            basePath={basePath}
            param="severity"
            values={SEVERITIES}
            active={severity}
            allLabel="All"
            preserve={category ? { category } : {}}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Category</span>
          <FilterLinks
            basePath={basePath}
            param="category"
            values={CATEGORIES}
            active={category}
            allLabel="All"
            preserve={severity ? { severity } : {}}
          />
        </div>
      </div>

      {findings.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted">
          Nothing matches this filter.
        </p>
      ) : (
        <div>
          {grouped.map((group) => (
            <section key={group.level}>
              <h3
                className={cn(
                  "border-b border-line bg-panel-alt px-5 py-1.5 text-xs font-semibold tracking-wide uppercase",
                  SEVERITY_TONE[group.level]?.className,
                )}
              >
                {SEVERITY_TONE[group.level]?.label ?? group.level} · {group.rows.length}
              </h3>
              <ul className="divide-y divide-line/60">
                {group.rows.map((finding) => (
                  <li key={finding.id} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="text-sm font-medium">{finding.title}</p>
                      <Badge tone={finding.source === "ai" ? "accent" : "neutral"}>
                        {finding.source === "ai" ? "AI" : "rule"}
                      </Badge>
                      <Badge>{finding.category}</Badge>
                      {finding.autoFixable ? <Badge tone="positive">adoptable</Badge> : null}
                    </div>

                    {finding.url ? (
                      <a
                        href={finding.url}
                        target="_blank"
                        rel="noreferrer"
                        title={finding.url}
                        className="mt-1 block truncate font-mono text-xs text-muted hover:text-accent hover:underline"
                      >
                        {shortenUrl(finding.url)}
                      </a>
                    ) : null}

                    <p className="mt-1.5 text-sm text-muted">{finding.detail}</p>
                    <p className="mt-1.5 text-sm">
                      <span className="font-medium">Fix: </span>
                      {finding.suggestion}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}
