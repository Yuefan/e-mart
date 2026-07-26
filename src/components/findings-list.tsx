import type { Finding } from "@prisma/client";
import Link from "next/link";
import { CATEGORIES, SEVERITIES } from "@/lib/ai/schemas";
import { getT } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { cn, shortenUrl } from "@/lib/utils";
import { Badge, Card, CardHeader } from "./ui";

/** Colour only; the label comes from the dictionary keyed by the same level. */
const SEVERITY_TONE: Record<string, string> = {
  critical: "text-neg",
  high: "text-neg",
  medium: "text-accent",
  low: "text-muted",
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

export async function FindingsList({
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
  const { t } = await getT();
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
        title={t.seo.findings}
        hint={
          findings.length === total
            ? fmt(t.seo.total, { n: total })
            : fmt(t.seo.shownOf, { shown: findings.length, total })
        }
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{t.seo.severity}</span>
          <FilterLinks
            basePath={basePath}
            param="severity"
            values={SEVERITIES}
            active={severity}
            allLabel={t.seo.all}
            preserve={category ? { category } : {}}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{t.seo.category}</span>
          <FilterLinks
            basePath={basePath}
            param="category"
            values={CATEGORIES}
            active={category}
            allLabel={t.seo.all}
            preserve={severity ? { severity } : {}}
          />
        </div>
      </div>

      {findings.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted">{t.seo.nothingMatches}</p>
      ) : (
        <div>
          {grouped.map((group) => (
            <section key={group.level}>
              <h3
                className={cn(
                  "border-b border-line bg-panel-alt px-5 py-1.5 text-xs font-semibold tracking-wide uppercase",
                  SEVERITY_TONE[group.level],
                )}
              >
                {t.seo.severities[group.level as keyof typeof t.seo.severities] ?? group.level} ·{" "}
                {group.rows.length}
              </h3>
              <ul className="divide-y divide-line/60">
                {group.rows.map((finding) => (
                  <li key={finding.id} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="text-sm font-medium">{finding.title}</p>
                      <Badge tone={finding.source === "ai" ? "accent" : "neutral"}>
                        {finding.source === "ai" ? t.seo.ai : t.seo.rule}
                      </Badge>
                      <Badge>{finding.category}</Badge>
                      {finding.autoFixable ? (
                        <Badge tone="positive">{t.seo.adoptable}</Badge>
                      ) : null}
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
                      <span className="font-medium">{t.seo.fix} </span>
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
