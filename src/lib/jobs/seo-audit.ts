import { AiBudgetError, AiConfigError, AiRefusalError, callAi, isAiConfigured } from "@/lib/ai/client";
import {
  PROMPT_VERSION,
  SYSTEM,
  type SeoEvidence,
  buildUserPrompt,
} from "@/lib/ai/prompts/seo-audit.v1";
import { type SeoAuditOutput, seoAuditSchema } from "@/lib/ai/schemas";
import { getBreakdown, getInsights, getTotals, previousPeriod } from "@/lib/gsc-queries";
import { prisma } from "@/lib/prisma";
import { crawlPages, fetchSiteFiles } from "@/lib/seo/crawl";
import { type PageMetrics, runRules, scoreFromFindings } from "@/lib/seo/rules";
import { addDays, formatDay } from "@/lib/utils";
import { latestAvailableDay } from "@/lib/range";

/** Spec §5.2 caps the live crawl at 50 URLs, taken from GSC top pages. */
const MAX_PAGES = 50;
const AUDIT_WINDOW_DAYS = 28;

export type SeoAuditResult = {
  auditId: string;
  score: number;
  ruleFindings: number;
  aiFindings: number;
  aiUsed: boolean;
  note?: string;
};

/**
 * Full audit pipeline (spec §5.2): gather evidence → deterministic rules →
 * AI for the judgement layer → persist.
 *
 * The AI step is optional. With no gateway configured the audit still runs and
 * still produces every rule finding — you lose prioritisation and rewrites,
 * not the audit.
 */
export async function runSeoAudit(
  siteId: string,
  options: { triggeredBy?: "cron" | "manual" } = {},
): Promise<SeoAuditResult> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: { bindings: { include: { connection: true } } },
  });
  if (!site) throw new Error("Site not found");

  const binding = site.bindings.find((b) => b.connection.provider === "GOOGLE");
  const property = binding?.resourceId ?? site.domain;

  const audit = await prisma.seoAudit.create({
    data: { siteId, triggeredBy: options.triggeredBy ?? "manual", status: "running" },
  });

  try {
    const to = latestAvailableDay();
    const from = addDays(to, -(AUDIT_WINDOW_DAYS - 1));
    const previous = previousPeriod(from, to);

    const [totals, previousTotals, topQueries, topPages, insights] = await Promise.all([
      getTotals(siteId, from, to),
      getTotals(siteId, previous.from, previous.to),
      getBreakdown(siteId, "query", from, to, { limit: 30 }),
      getBreakdown(siteId, "page", from, to, { limit: MAX_PAGES }),
      getInsights(siteId, from, to),
    ]);

    const origin = `https://${site.domain}`;
    // Fall back to the homepage when Search Console has no page rows yet.
    const urls = topPages.length ? topPages.map((row) => row.value) : [origin];

    const [pages, siteFiles] = await Promise.all([
      crawlPages(urls.slice(0, MAX_PAGES)),
      fetchSiteFiles(origin),
    ]);

    const metricsByUrl = new Map<string, PageMetrics>(
      topPages.map((row) => [
        row.value,
        {
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        },
      ]),
    );

    const ruleFindings = runRules({ snapshots: pages, siteFiles, metricsByUrl });
    // Normalise by pages actually inspected — throttled URLs produce no
    // findings, and counting them would flatter the score.
    const auditedPages = pages.filter((page) => page.ok).length;
    const ruleScore = scoreFromFindings(ruleFindings, Math.max(1, auditedPages));

    const evidence: SeoEvidence = {
      site: { name: site.name, domain: site.domain, property },
      window: { from: formatDay(from), to: formatDay(to) },
      totals,
      previousTotals,
      topQueries,
      topPages,
      opportunityQueries: insights.opportunityQueries,
      strikingDistancePages: insights.strikingDistancePages,
      decliningPages: insights.decliningPages.map((p) => ({
        value: p.value,
        deltaClicks: p.deltaClicks ?? 0,
      })),
      siteFiles,
      pages,
      ruleFindings,
      brandVoice: site.brandVoice,
    };

    let ai: SeoAuditOutput | null = null;
    let aiMeta: string | null = null;
    let note: string | undefined;

    if (isAiConfigured()) {
      try {
        const result = await callAi({
          task: "seo_audit",
          schema: seoAuditSchema,
          system: SYSTEM,
          prompt: buildUserPrompt(evidence),
          promptVersion: PROMPT_VERSION,
          tier: "analysis",
          maxTokens: 16_000,
        });
        ai = result.data;
        aiMeta = JSON.stringify(result.usage);
      } catch (error) {
        // A failed AI call must not throw away a complete rule audit.
        if (
          error instanceof AiBudgetError ||
          error instanceof AiConfigError ||
          error instanceof AiRefusalError
        ) {
          note = error.message;
        } else {
          note = `AI analysis failed: ${error instanceof Error ? error.message : String(error)}`;
        }
        console.error("[seo-audit] AI step failed", error);
      }
    } else {
      note = "AI gateway not configured — rule-engine findings only.";
    }

    const score = ai ? Math.round(Math.max(0, Math.min(100, ai.score))) : ruleScore;

    await prisma.finding.createMany({
      data: [
        ...ruleFindings.map((finding) => ({
          auditId: audit.id,
          severity: finding.severity,
          category: finding.category,
          url: finding.url,
          title: finding.title,
          detail: finding.detail,
          suggestion: finding.suggestion,
          evidence: finding.evidence ? JSON.stringify(finding.evidence) : null,
          source: "rule",
          autoFixable: finding.autoFixable,
        })),
        ...(ai?.findings ?? []).map((finding) => ({
          auditId: audit.id,
          severity: finding.severity,
          category: finding.category,
          url: finding.url,
          title: finding.title,
          detail: finding.detail,
          suggestion: finding.suggestion,
          evidence: null,
          source: "ai",
          autoFixable: false,
        })),
        // Rewrites are findings too — they are the concrete, adoptable output.
        ...(ai?.rewrites ?? []).map((rewrite) => ({
          auditId: audit.id,
          severity: "medium",
          category: "onpage",
          url: rewrite.url,
          title: `Suggested ${rewrite.field === "title" ? "title" : "meta description"} rewrite`,
          detail: rewrite.rationale,
          suggestion: rewrite.value,
          evidence: JSON.stringify({ field: rewrite.field, value: rewrite.value }),
          source: "ai",
          // Marked adoptable so the Shopify/GitHub writers can pick these up later.
          autoFixable: true,
        })),
      ],
    });

    const summary = [ai?.summary, note].filter(Boolean).join("\n\n") || null;

    await prisma.seoAudit.update({
      where: { id: audit.id },
      data: {
        status: "done",
        score,
        summary,
        aiMeta,
        rawInput: JSON.stringify({
          window: evidence.window,
          pagesCrawled: pages.length,
          ruleFindings: ruleFindings.length,
          priorityActions: ai?.priorityActions ?? [],
        }),
        finishedAt: new Date(),
      },
    });

    return {
      auditId: audit.id,
      score,
      ruleFindings: ruleFindings.length,
      aiFindings: (ai?.findings.length ?? 0) + (ai?.rewrites.length ?? 0),
      aiUsed: Boolean(ai),
      note,
    };
  } catch (error) {
    await prisma.seoAudit.update({
      where: { id: audit.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}
