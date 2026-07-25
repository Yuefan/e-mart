import { callAi } from "@/lib/ai/client";
import {
  ARTICLE_SYSTEM,
  IDEATION_SYSTEM,
  OUTLINE_SYSTEM,
  PROMPT_VERSION,
  SELF_CHECK_SYSTEM,
  buildArticlePrompt,
  buildIdeationPrompt,
  buildOutlinePrompt,
  buildSelfCheckPrompt,
} from "@/lib/ai/prompts/content.v1";
import {
  type ArticleDraft,
  type Outline,
  type SelfCheck,
  type TopicIdea,
  articleSchema,
  outlineSchema,
  selfCheckSchema,
  topicIdeasSchema,
} from "@/lib/ai/schemas";
import { EMPTY_BRAND_VOICE, formatBrandVoiceForPrompt, parseBrandVoice } from "@/lib/brand-voice";
import { type MechanicalIssue, countWords, runMechanicalChecks } from "@/lib/content/checks";
import { getBreakdown, getInsights } from "@/lib/gsc-queries";
import { prisma } from "@/lib/prisma";
import { latestAvailableDay } from "@/lib/range";
import { addDays, shortenUrl } from "@/lib/utils";
import { updateProgress } from "./queue";

const IDEATION_WINDOW_DAYS = 90;
const DEFAULT_TOPIC_COUNT = 5;

async function loadSiteContext(siteId: string) {
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) throw new Error("Site not found");

  const voice = parseBrandVoice(site.brandVoice) ?? EMPTY_BRAND_VOICE;
  return { site, voice, brandVoiceText: formatBrandVoiceForPrompt(voice) };
}

// ---- step 1: topic selection ----

export type IdeationResult = {
  topics: TopicIdea[];
  costUsd: number;
};

export async function runTopicIdeation(
  siteId: string,
  options: { count?: number; jobId?: string } = {},
): Promise<IdeationResult> {
  const { site, brandVoiceText } = await loadSiteContext(siteId);
  const count = options.count ?? DEFAULT_TOPIC_COUNT;

  const to = latestAvailableDay();
  const from = addDays(to, -(IDEATION_WINDOW_DAYS - 1));

  const [insights, topQueries, existing] = await Promise.all([
    getInsights(siteId, from, to),
    getBreakdown(siteId, "query", from, to, { limit: 20 }),
    prisma.article.findMany({ where: { siteId }, select: { title: true } }),
  ]);

  if (insights.opportunityQueries.length === 0 && topQueries.length === 0) {
    throw new Error(
      "No Search Console data to work from. Run a sync first — topic selection is driven by your own query data.",
    );
  }

  if (options.jobId) await updateProgress(options.jobId, 40);

  const result = await callAi({
    task: "topic_ideation",
    schema: topicIdeasSchema,
    system: IDEATION_SYSTEM,
    prompt: buildIdeationPrompt({
      site: { name: site.name, domain: site.domain },
      brandVoice: brandVoiceText,
      opportunityQueries: insights.opportunityQueries.map((q) => ({
        value: q.value,
        impressions: q.impressions,
        ctr: q.ctr,
        position: q.position,
      })),
      topQueries: topQueries.map((q) => ({
        value: q.value,
        clicks: q.clicks,
        impressions: q.impressions,
        position: q.position,
      })),
      existingTitles: existing.map((a) => a.title),
      count,
    }),
    promptVersion: PROMPT_VERSION,
    tier: "fast",
    maxTokens: 8_000,
  });

  return {
    topics: [...result.data.topics].sort((a, b) => b.estValue - a.estValue),
    costUsd: result.usage.costUsd,
  };
}

// ---- steps 2-5: outline, body, checks ----

export type GenerateResult = {
  articleId: string;
  title: string;
  slug: string;
  wordCount: number;
  blockers: number;
  warnings: number;
  costUsd: number;
};

/** Ensures the slug is unique within the site before writing. */
async function uniqueSlug(siteId: string, base: string): Promise<string> {
  const normalised =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "untitled";

  for (let suffix = 0; suffix < 50; suffix++) {
    const candidate = suffix === 0 ? normalised : `${normalised}-${suffix + 1}`;
    const clash = await prisma.article.findUnique({
      where: { siteId_slug: { siteId, slug: candidate } },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  return `${normalised}-${Date.now()}`;
}

export async function runContentGenerate(
  siteId: string,
  options: { topic: TopicIdea; jobId?: string },
): Promise<GenerateResult> {
  const { site, voice, brandVoiceText } = await loadSiteContext(siteId);
  const { topic, jobId } = options;

  const to = latestAvailableDay();
  const from = addDays(to, -(IDEATION_WINDOW_DAYS - 1));

  const [existingArticles, topPages] = await Promise.all([
    prisma.article.findMany({
      where: { siteId },
      select: { title: true, slug: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    getBreakdown(siteId, "page", from, to, { limit: 15 }),
  ]);

  // Link targets: pages the site already ranks for, plus its own drafts.
  const linkTargets = [
    ...topPages.map((page) => ({ url: page.value, title: shortenUrl(page.value) })),
    ...existingArticles.map((article) => ({
      url: `https://${site.domain}/blogs/${article.slug}`,
      title: article.title,
    })),
  ].slice(0, 20);

  let totalCost = 0;

  // --- outline ---
  if (jobId) await updateProgress(jobId, 15);
  const outlineResult = await callAi({
    task: "outline",
    schema: outlineSchema,
    system: OUTLINE_SYSTEM,
    prompt: buildOutlinePrompt({
      topic,
      brandVoice: brandVoiceText,
      linkTargets,
      wordCountRange: voice.wordCountRange,
    }),
    promptVersion: PROMPT_VERSION,
    tier: "analysis",
    maxTokens: 8_000,
  });
  const outline: Outline = outlineResult.data;
  totalCost += outlineResult.usage.costUsd;

  // --- body ---
  if (jobId) await updateProgress(jobId, 45);
  const articleResult = await callAi({
    task: "article",
    schema: articleSchema,
    system: ARTICLE_SYSTEM,
    prompt: buildArticlePrompt({
      topic,
      outline,
      brandVoice: brandVoiceText,
      wordCountRange: voice.wordCountRange,
      domain: site.domain,
    }),
    promptVersion: PROMPT_VERSION,
    tier: "analysis",
    maxTokens: 32_000,
  });
  const draft: ArticleDraft = articleResult.data;
  totalCost += articleResult.usage.costUsd;

  // --- deterministic checks before spending tokens on review ---
  if (jobId) await updateProgress(jobId, 75);
  const mechanical = runMechanicalChecks({
    bodyMd: draft.bodyMd,
    metaTitle: draft.metaTitle,
    metaDesc: draft.metaDesc,
    slug: draft.slug,
    targetKeyword: topic.targetKeyword,
    forbidden: voice.forbidden,
    wordCountRange: voice.wordCountRange,
    siteDomain: site.domain,
    existingTitles: existingArticles.map((a) => a.title),
    title: topic.title,
  });

  // --- editorial review ---
  let review: SelfCheck | null = null;
  try {
    const reviewResult = await callAi({
      task: "self_check",
      schema: selfCheckSchema,
      system: SELF_CHECK_SYSTEM,
      prompt: buildSelfCheckPrompt({
        bodyMd: draft.bodyMd,
        metaTitle: draft.metaTitle,
        metaDesc: draft.metaDesc,
        slug: draft.slug,
        targetKeyword: topic.targetKeyword,
        forbidden: voice.forbidden,
        mechanicalIssues: mechanical.map((issue) => issue.message),
      }),
      promptVersion: PROMPT_VERSION,
      tier: "fast",
      maxTokens: 4_000,
    });
    review = reviewResult.data;
    totalCost += reviewResult.usage.costUsd;
  } catch (error) {
    // The draft is written; losing the review is not worth losing the draft.
    console.error("[content] self-check failed", error);
  }

  const allIssues: MechanicalIssue[] = [
    ...mechanical,
    ...(review?.issues ?? []).map((issue) => ({
      severity: issue.severity,
      message: issue.message,
    })),
  ];
  const blockers = allIssues.filter((issue) => issue.severity === "blocker").length;

  if (jobId) await updateProgress(jobId, 90);

  const slug = await uniqueSlug(siteId, draft.slug);
  const article = await prisma.article.create({
    data: {
      siteId,
      title: topic.title,
      slug,
      excerpt: draft.excerpt,
      bodyMd: draft.bodyMd,
      metaTitle: draft.metaTitle,
      metaDesc: draft.metaDesc,
      targetKeyword: topic.targetKeyword,
      searchIntent: topic.searchIntent,
      // Blockers park the draft in review rather than presenting it as ready.
      status: blockers > 0 ? "review" : "draft",
      outline,
      checks: {
        issues: allIssues,
        unsupportedClaims: review?.unsupportedClaims ?? [],
        reviewed: Boolean(review),
      },
      aiMeta: {
        promptVersion: PROMPT_VERSION,
        costUsd: totalCost,
        steps: {
          outline: outlineResult.usage,
          article: articleResult.usage,
        },
      },
    },
  });

  return {
    articleId: article.id,
    title: article.title,
    slug: article.slug,
    wordCount: countWords(draft.bodyMd),
    blockers,
    warnings: allIssues.length - blockers,
    costUsd: totalCost,
  };
}
