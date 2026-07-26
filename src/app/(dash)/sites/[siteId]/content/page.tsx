import Link from "next/link";
import { notFound } from "next/navigation";
import { isAiConfigured } from "@/lib/ai/client";
import { requireUser } from "@/lib/auth";
import { isBrandVoiceUsable, parseBrandVoice } from "@/lib/brand-voice";
import { countWords } from "@/lib/content/checks";
import { getT } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { arrayField } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { TopicPicker } from "@/components/topic-picker";
import { Badge, Card, CardHeader, buttonClass } from "@/components/ui";

type PageProps = {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ status?: string }>;
};

const STATUSES = ["draft", "review", "scheduled", "published", "failed"] as const;

const STATUS_TONE: Record<string, "neutral" | "positive" | "negative" | "accent"> = {
  draft: "neutral",
  review: "accent",
  scheduled: "accent",
  published: "positive",
  failed: "negative",
};

function countBlockers(checks: unknown): number {
  return arrayField<{ severity?: string }>(checks, "issues").filter(
    (issue) => issue.severity === "blocker",
  ).length;
}

export default async function ContentPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const { t } = await getT();
  const { siteId } = await params;

  const site = await prisma.site.findFirst({ where: { id: siteId, userId: user.id } });
  if (!site) notFound();

  const { status: statusParam } = await searchParams;
  const status = STATUSES.includes(statusParam as (typeof STATUSES)[number])
    ? statusParam
    : null;

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where: { siteId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
    }),
    prisma.article.count({ where: { siteId } }),
  ]);

  const brandVoice = parseBrandVoice(site.brandVoice);
  const aiReady = isAiConfigured();
  const basePath = `/sites/${siteId}/content`;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">{t.content.title}</h1>
        <p className="mt-0.5 text-sm text-muted">
          {fmt(t.content.siteIntro, { site: site.name })}
        </p>
      </header>

      {!isBrandVoiceUsable(brandVoice) ? (
        <Card className="mb-4 border-accent/30">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <p className="text-sm">
              <span className="font-medium">{t.content.setBrandVoice}</span>{" "}
              <span className="text-muted">{t.content.setBrandVoiceHint}</span>
            </p>
            <Link href={`/sites/${siteId}/settings`} className={buttonClass("secondary")}>
              {t.content.configure}
            </Link>
          </div>
        </Card>
      ) : null}

      <Card className="mb-4">
        <CardHeader title={t.content.newDraft} />
        <TopicPicker siteId={siteId} aiConfigured={aiReady} />
      </Card>

      <Card>
        <CardHeader
          title={t.content.drafts}
          hint={
            status
              ? fmt(t.seo.shownOf, { shown: articles.length, total })
              : fmt(t.seo.total, { n: total })
          }
        />

        <div className="flex flex-wrap gap-1 border-b border-line px-5 py-3">
          <Link
            href={basePath}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              status === null ? "bg-panel-alt text-fg" : "text-muted hover:text-fg",
            )}
          >
            {t.content.all}
          </Link>
          {STATUSES.map((value) => (
            <Link
              key={value}
              href={`${basePath}?status=${value}`}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                status === value ? "bg-panel-alt text-fg" : "text-muted hover:text-fg",
              )}
            >
              {t.content.statuses[value]}
            </Link>
          ))}
        </div>

        {articles.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted">
            {total === 0 ? t.content.noDrafts : t.content.nothingWithStatus}
          </p>
        ) : (
          <ul className="divide-y divide-line/60">
            {articles.map((article) => {
              const blockers = countBlockers(article.checks);
              return (
                <li key={article.id}>
                  <Link
                    href={`${basePath}/${article.id}`}
                    className="block px-5 py-3.5 transition-colors hover:bg-panel-alt"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="text-sm font-medium">{article.title}</p>
                      <Badge tone={STATUS_TONE[article.status] ?? "neutral"}>
                        {t.content.statuses[
                          article.status as keyof typeof t.content.statuses
                        ] ?? article.status}
                      </Badge>
                      {blockers > 0 ? (
                        <Badge tone="negative">
                          {fmt(t.content.blockers, { n: blockers }, blockers)}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">
                      <span className="font-mono">/{article.slug}</span>
                      {article.targetKeyword ? ` · ${article.targetKeyword}` : ""} ·{" "}
                      {fmt(t.content.words, { n: countWords(article.bodyMd) })} ·{" "}
                      {article.createdAt.toISOString().slice(0, 10)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </main>
  );
}
