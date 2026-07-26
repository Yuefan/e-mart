import { notFound } from "next/navigation";
import { CATEGORIES, SEVERITIES } from "@/lib/ai/schemas";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { arrayField } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { AuditButton } from "@/components/audit-button";
import { AuditHistory } from "@/components/audit-history";
import { FindingsList } from "@/components/findings-list";
import { ScoreRing } from "@/components/score-ring";
import { Card, CardHeader, EmptyState } from "@/components/ui";

type PageProps = {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ severity?: string; category?: string; audit?: string }>;
};

function pick(value: string | undefined, allowed: readonly string[]): string | null {
  return value && allowed.includes(value) ? value : null;
}

export default async function SeoPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const { t } = await getT();
  const { siteId } = await params;

  const site = await prisma.site.findFirst({ where: { id: siteId, userId: user.id } });
  if (!site) notFound();

  const {
    severity: severityParam,
    category: categoryParam,
    audit: auditParam,
  } = await searchParams;
  const severity = pick(severityParam, SEVERITIES);
  const category = pick(categoryParam, CATEGORIES);
  const basePath = `/sites/${siteId}/seo`;

  const findingFilter = {
    where: {
      ...(severity ? { severity } : {}),
      ...(category ? { category } : {}),
    },
    orderBy: { severity: "asc" as const },
  };

  const [latest, history] = await Promise.all([
    // `?audit=` pins a past run; without it the newest completed one is shown.
    // Scoped by siteId as well as id so an audit id from another user's site
    // cannot be read by guessing it.
    prisma.seoAudit.findFirst({
      where: auditParam
        ? { id: auditParam, siteId, status: "done" }
        : { siteId, status: "done" },
      orderBy: { createdAt: "desc" },
      include: { findings: findingFilter },
    }),
    // Every run, including failures and the one in flight — those are the ones
    // worth seeing and they were previously filtered out.
    prisma.seoAudit.findMany({
      where: { siteId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        score: true,
        triggeredBy: true,
        createdAt: true,
        finishedAt: true,
        error: true,
        aiMeta: true,
        _count: { select: { findings: true } },
      },
    }),
  ]);

  const historyRows = history.map(({ _count, ...row }) => ({
    ...row,
    findingCount: _count.findings,
  }));
  const scored = historyRows.filter((row) => row.score !== null);
  const auditRunning = historyRows.some(
    (row) => row.status === "running" || row.status === "queued",
  );

  const totalFindings = latest
    ? await prisma.finding.count({ where: { auditId: latest.id } })
    : 0;

  const priorityActions = arrayField<unknown>(latest?.rawInput, "priorityActions").filter(
    (action): action is string => typeof action === "string",
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{t.seo.title}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {fmt(t.seo.siteIntro, { site: site.name })}
          </p>
          {latest ? (
            <p className="mt-1 text-xs text-muted">
              {fmt(t.seo.lastRun, {
                when: latest.createdAt.toISOString().replace("T", " ").slice(0, 16),
              })}
            </p>
          ) : null}
          {auditRunning ? (
            <p className="mt-1 text-xs text-accent">{t.seo.auditRunning}</p>
          ) : null}
        </div>
        <AuditButton siteId={siteId} />
      </header>

      {!latest ? (
        <div className="space-y-4">
          <Card>
            <EmptyState
              title={t.seo.noAuditTitle}
              description={t.seo.noAuditHint}
              action={<AuditButton siteId={siteId} />}
            />
          </Card>
          {historyRows.length > 0 ? (
            <AuditHistory rows={historyRows} basePath={basePath} selectedId="" />
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="px-5 py-4">
              <ScoreRing score={latest.score ?? 0} />
              {scored.length > 1 ? (
                <p className="mt-3 text-xs text-muted">
                  {t.seo.previous}{" "}
                  {scored
                    .filter((a) => a.id !== latest.id)
                    .slice(0, 7)
                    .map((a) => a.score)
                    .join(" · ")}
                </p>
              ) : null}
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader title={t.seo.summary} />
              <div className="px-5 py-4">
                {latest.summary ? (
                  <p className="text-sm whitespace-pre-line text-muted">{latest.summary}</p>
                ) : (
                  <p className="text-sm text-muted">{t.seo.noSummary}</p>
                )}

                {priorityActions.length > 0 ? (
                  <>
                    <h3 className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">
                      {t.seo.doFirst}
                    </h3>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                      {priorityActions.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ol>
                  </>
                ) : null}
              </div>
            </Card>
          </div>

          <FindingsList
            findings={latest.findings}
            basePath={basePath}
            severity={severity}
            category={category}
            total={totalFindings}
          />

          <AuditHistory rows={historyRows} basePath={basePath} selectedId={latest.id} />
        </div>
      )}
    </main>
  );
}
