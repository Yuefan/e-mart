import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { EMPTY_BRAND_VOICE, parseBrandVoice } from "@/lib/brand-voice";
import { runMechanicalChecks } from "@/lib/content/checks";
import { getT } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { arrayField } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { ArticleEditor } from "@/components/article-editor";

type PageProps = { params: Promise<{ siteId: string; articleId: string }> };

function parseUnsupportedClaims(checks: unknown): string[] {
  return arrayField<unknown>(checks, "unsupportedClaims").filter(
    (claim): claim is string => typeof claim === "string",
  );
}

export default async function ArticlePage({ params }: PageProps) {
  const user = await requireUser();
  const { t } = await getT();
  const { siteId, articleId } = await params;

  const article = await prisma.article.findFirst({
    where: { id: articleId, siteId, site: { userId: user.id } },
    include: { site: true },
  });
  if (!article) notFound();

  const voice = parseBrandVoice(article.site.brandVoice) ?? EMPTY_BRAND_VOICE;
  const unsupportedClaims = parseUnsupportedClaims(article.checks);

  // Recomputed on load rather than read from the stored verdict: the two can
  // drift (an older run, a changed brand voice), and a checks panel that
  // disagrees with the SEO bar next to it is worse than no panel.
  const issues = runMechanicalChecks({
    bodyMd: article.bodyMd,
    metaTitle: article.metaTitle ?? "",
    metaDesc: article.metaDesc ?? "",
    slug: article.slug,
    targetKeyword: article.targetKeyword ?? "",
    forbidden: voice.forbidden,
    wordCountRange: voice.wordCountRange,
    siteDomain: article.site.domain,
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-5">
        <Link
          href={`/sites/${siteId}/content`}
          className="text-xs text-muted hover:text-fg hover:underline"
        >
          {t.content.editor.backToContent}
        </Link>
        <h1 className="mt-1.5 text-lg font-semibold">{article.title}</h1>
        <p className="mt-0.5 text-sm text-muted">
          {fmt(t.content.editor.siteAndDate, {
            site: article.site.name,
            date: article.createdAt.toISOString().slice(0, 10),
          })}
        </p>
      </header>

      {unsupportedClaims.length > 0 ? (
        <div className="mb-4 rounded-xl border border-accent/40 bg-panel px-5 py-3.5">
          <p className="text-sm font-medium">{t.content.editor.claimsToVerify}</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted">
            {unsupportedClaims.map((claim) => (
              <li key={claim}>{claim}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ArticleEditor
        siteId={siteId}
        siteDomain={article.site.domain}
        wordCountRange={voice.wordCountRange}
        initialIssues={issues}
        article={{
          id: article.id,
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt ?? "",
          bodyMd: article.bodyMd,
          metaTitle: article.metaTitle ?? "",
          metaDesc: article.metaDesc ?? "",
          targetKeyword: article.targetKeyword ?? "",
          status: article.status,
        }}
      />
    </main>
  );
}
