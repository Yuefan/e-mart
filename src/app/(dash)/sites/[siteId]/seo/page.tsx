import { notFound } from "next/navigation";
import { CATEGORIES, SEVERITIES } from "@/lib/ai/schemas";
import { requireUser } from "@/lib/auth";
import { arrayField } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { AuditButton } from "@/components/audit-button";
import { FindingsList } from "@/components/findings-list";
import { ScoreRing } from "@/components/score-ring";
import { Card, CardHeader, EmptyState } from "@/components/ui";

type PageProps = {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ severity?: string; category?: string }>;
};

function pick(value: string | undefined, allowed: readonly string[]): string | null {
  return value && allowed.includes(value) ? value : null;
}

export default async function SeoPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const { siteId } = await params;

  const site = await prisma.site.findFirst({ where: { id: siteId, userId: user.id } });
  if (!site) notFound();

  const { severity: severityParam, category: categoryParam } = await searchParams;
  const severity = pick(severityParam, SEVERITIES);
  const category = pick(categoryParam, CATEGORIES);
  const basePath = `/sites/${siteId}/seo`;

  const [latest, history] = await Promise.all([
    prisma.seoAudit.findFirst({
      where: { siteId, status: "done" },
      orderBy: { createdAt: "desc" },
      include: {
        findings: {
          where: {
            ...(severity ? { severity } : {}),
            ...(category ? { category } : {}),
          },
          orderBy: { severity: "asc" },
        },
      },
    }),
    prisma.seoAudit.findMany({
      where: { siteId, status: "done", score: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, score: true, createdAt: true },
    }),
  ]);

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
          <h1 className="text-lg font-semibold">SEO audit</h1>
          <p className="mt-0.5 text-sm text-muted">
            {site.name} · rule engine first, AI for prioritisation and rewrites
          </p>
          {latest ? (
            <p className="mt-1 text-xs text-muted">
              Last run {latest.createdAt.toISOString().replace("T", " ").slice(0, 16)} UTC
            </p>
          ) : null}
        </div>
        <AuditButton siteId={siteId} />
      </header>

      {!latest ? (
        <Card>
          <EmptyState
            title="No audit yet"
            description="An audit crawls up to 50 of your top pages, runs the deterministic checks, then asks the model to prioritise and write replacement copy. It runs in the worker, so start that first."
            action={<AuditButton siteId={siteId} />}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="px-5 py-4">
              <ScoreRing score={latest.score ?? 0} />
              {history.length > 1 ? (
                <p className="mt-3 text-xs text-muted">
                  Previous:{" "}
                  {history
                    .slice(1)
                    .map((a) => a.score)
                    .join(" · ")}
                </p>
              ) : null}
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader title="Summary" />
              <div className="px-5 py-4">
                {latest.summary ? (
                  <p className="text-sm whitespace-pre-line text-muted">{latest.summary}</p>
                ) : (
                  <p className="text-sm text-muted">No summary recorded for this run.</p>
                )}

                {priorityActions.length > 0 ? (
                  <>
                    <h3 className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">
                      Do these first
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
        </div>
      )}
    </main>
  );
}
