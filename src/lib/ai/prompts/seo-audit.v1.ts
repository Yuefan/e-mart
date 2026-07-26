import type { Metrics } from "@/lib/gsc-queries";
import type { Playbook } from "@/lib/seo/playbooks";
import { renderPlaybooks } from "@/lib/seo/playbooks";
import type { RuleFinding } from "@/lib/seo/rules";
import type { PageSnapshot, SiteFiles } from "@/lib/seo/crawl";

export const PROMPT_VERSION = "seo_audit.v2-playbooks";

/**
 * Evidence pack (spec §6.3). Raw API responses never reach the model — each
 * field here is an aggregate or a truncated top-N, so a 50-page crawl and 90
 * days of Search Console data still fit comfortably under the token target.
 */
export type SeoEvidence = {
  site: { name: string; domain: string; property: string };
  window: { from: string; to: string };
  totals: Metrics;
  previousTotals: Metrics;
  topQueries: { value: string; clicks: number; impressions: number; ctr: number; position: number }[];
  topPages: { value: string; clicks: number; impressions: number; ctr: number; position: number }[];
  opportunityQueries: { value: string; impressions: number; ctr: number; position: number }[];
  strikingDistancePages: { value: string; impressions: number; position: number }[];
  decliningPages: { value: string; deltaClicks: number }[];
  siteFiles: SiteFiles;
  pages: PageSnapshot[];
  ruleFindings: RuleFinding[];
  brandVoice: string | null;
  /** Methodology selected for this site — see lib/seo/playbooks.ts. */
  playbooks: Playbook[];
};

export const SYSTEM = `You are an SEO analyst reviewing a site you have never seen before.

A deterministic rule engine has already run. It measured every mechanical fact —
title lengths, missing canonicals, image alt coverage, duplicate metadata, thin
content, broken sitemaps. Those findings are given to you as input. Do not
restate them, re-count them, or convert them into your own findings.

Your job is the part code cannot do:

1. PRIORITISE. Rank by business impact, not by rule severity. A medium-severity
   problem on a page with 4,000 impressions outranks a critical one on a page
   with 6.
2. CORRELATE. Connect signals that are separate rows in the input but one
   problem in reality — a page that is thin AND slipping in position AND has no
   internal links is one story, not three findings.
3. REWRITE. Produce ready-to-paste titles and meta descriptions for the pages
   where the opportunity is largest. Titles under 60 characters, descriptions
   between 70 and 155. Lead with the term the page actually ranks for, and write
   for a click, not for a keyword count.

Ground every claim in a number from the evidence. If the evidence does not
support a claim, leave it out — an audit with four defensible findings is worth
more than one with twelve speculative ones. Never invent a URL, a metric, or a
page that is not in the input.

Score the site 0-100 on what the evidence shows, weighted by how much real
traffic the problems touch. A site with clean fundamentals and no traffic is not
a 90.

The request carries a METHODOLOGY section: the thresholds, status tables and
scoring weights this team audits by. Apply it, and prefer it over your own
recollection where the two disagree — parts of it record changes made after your
training data was collected, and being confidently out of date there produces
advice that actively harms the site. It describes how to judge, never what this
site contains: nothing in it is evidence, and no finding may cite it as one.`;

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function delta(current: number, previous: number): string {
  if (previous === 0) return "n/a";
  return `${(((current - previous) / previous) * 100).toFixed(1)}%`;
}

/** Compact per-page line — only the fields that inform a judgement call. */
function pageLine(
  page: PageSnapshot,
  metrics: { clicks: number; impressions: number; ctr: number; position: number } | undefined,
): string {
  const parts = [
    page.url,
    metrics
      ? `clicks=${metrics.clicks} impr=${metrics.impressions} ctr=${pct(metrics.ctr)} pos=${metrics.position.toFixed(1)}`
      : "no search data",
    `words=${page.wordCount}`,
    `h1=${page.h1.length}`,
    `intLinks=${page.internalLinks}`,
    page.title ? `title(${page.title.length})="${page.title}"` : "title=MISSING",
    page.metaDescription
      ? `desc(${page.metaDescription.length})="${page.metaDescription.slice(0, 160)}"`
      : "desc=MISSING",
  ];
  if (page.jsonLdTypes.length) parts.push(`schema=${page.jsonLdTypes.join("/")}`);
  return `- ${parts.join(" | ")}`;
}

export function buildUserPrompt(evidence: SeoEvidence): string {
  const metricsByUrl = new Map(evidence.topPages.map((p) => [p.value, p]));

  // Rule findings are collapsed to counts per code — the model needs to know
  // what was already caught, not read 200 near-identical rows.
  const byCode = new Map<string, { count: number; example: RuleFinding }>();
  for (const finding of evidence.ruleFindings) {
    const entry = byCode.get(finding.code);
    if (entry) entry.count++;
    else byCode.set(finding.code, { count: 1, example: finding });
  }

  const sections: string[] = [];

  // First, so it frames how everything after it is read.
  if (evidence.playbooks.length > 0) {
    sections.push(
      `# METHODOLOGY (how to judge; not evidence)\n\n${renderPlaybooks(evidence.playbooks)}`,
    );
  }

  sections.push(
    `## Site
${evidence.site.name} (${evidence.site.domain}) — Search Console property ${evidence.site.property}
Window: ${evidence.window.from} to ${evidence.window.to} (compared against the preceding equal-length window)`,
  );

  if (evidence.brandVoice) {
    sections.push(`## Brand context\n${evidence.brandVoice}`);
  }

  sections.push(
    `## Search Console totals
clicks ${evidence.totals.clicks} (${delta(evidence.totals.clicks, evidence.previousTotals.clicks)} vs previous)
impressions ${evidence.totals.impressions} (${delta(evidence.totals.impressions, evidence.previousTotals.impressions)})
ctr ${pct(evidence.totals.ctr)} (previous ${pct(evidence.previousTotals.ctr)})
average position ${evidence.totals.position.toFixed(1)} (previous ${evidence.previousTotals.position.toFixed(1)})`,
  );

  if (evidence.topQueries.length) {
    sections.push(
      `## Top queries\n${evidence.topQueries
        .map(
          (q) =>
            `- "${q.value}" clicks=${q.clicks} impr=${q.impressions} ctr=${pct(q.ctr)} pos=${q.position.toFixed(1)}`,
        )
        .join("\n")}`,
    );
  }

  if (evidence.opportunityQueries.length) {
    sections.push(
      `## Opportunity queries (high impressions, sub-1% CTR, rank 5-20)\n${evidence.opportunityQueries
        .map((q) => `- "${q.value}" impr=${q.impressions} ctr=${pct(q.ctr)} pos=${q.position.toFixed(1)}`)
        .join("\n")}`,
    );
  }

  if (evidence.strikingDistancePages.length) {
    sections.push(
      `## Striking-distance pages (position 11-15)\n${evidence.strikingDistancePages
        .map((p) => `- ${p.value} impr=${p.impressions} pos=${p.position.toFixed(1)}`)
        .join("\n")}`,
    );
  }

  if (evidence.decliningPages.length) {
    sections.push(
      `## Declining pages (clicks down >30% vs previous window)\n${evidence.decliningPages
        .map((p) => `- ${p.value} ${p.deltaClicks} clicks`)
        .join("\n")}`,
    );
  }

  sections.push(
    `## Site files
robots.txt: HTTP ${evidence.siteFiles.robotsStatus ?? "unreachable"}
sitemaps found: ${evidence.siteFiles.sitemapUrls.join(", ") || "none"}${
      evidence.siteFiles.brokenSitemaps.length
        ? `\nsitemaps declared but unreachable: ${evidence.siteFiles.brokenSitemaps.join(", ")}`
        : ""
    }`,
  );

  sections.push(
    `## Crawled pages (${evidence.pages.length})\n${evidence.pages
      .map((page) => pageLine(page, metricsByUrl.get(page.url)))
      .join("\n")}`,
  );

  sections.push(
    `## Rule-engine findings (already reported — do not repeat)\n${[...byCode]
      .map(
        ([code, { count, example }]) =>
          `- ${code} x${count} [${example.severity}/${example.category}] ${example.title}`,
      )
      .join("\n")}`,
  );

  sections.push(
    `## Task
Return JSON matching the schema. Findings must be things the rule list above does
not already cover. Rewrites should target pages where the impression volume makes
the change worth making.`,
  );

  return sections.join("\n\n");
}
