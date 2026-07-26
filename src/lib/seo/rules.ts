import type { PageSnapshot, SiteFiles } from "./crawl";
import { blockedAiCrawlers, withdrawnSchemaTypes } from "./ai-crawlers";

/**
 * Deterministic checks (spec §5.2). Anything code can decide — a title over 60
 * characters, a missing canonical, an image without alt — is decided here and
 * never sent to the model. The AI only gets what needs judgement: priority,
 * cross-signal correlation, and rewrite suggestions.
 */

export type Severity = "critical" | "high" | "medium" | "low";
export type Category = "technical" | "content" | "onpage" | "performance" | "indexing";

export type RuleFinding = {
  code: string;
  severity: Severity;
  category: Category;
  url: string | null;
  title: string;
  detail: string;
  suggestion: string;
  evidence: Record<string, unknown> | null;
  autoFixable: boolean;
};

export type PageMetrics = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type RuleInput = {
  snapshots: PageSnapshot[];
  siteFiles: SiteFiles;
  /** GSC metrics keyed by URL, used to weight severity by actual traffic. */
  metricsByUrl: Map<string, PageMetrics>;
};

const TITLE_MAX = 60;
const TITLE_MIN = 20;
const DESC_MAX = 155;
const DESC_MIN = 70;
const THIN_CONTENT_WORDS = 300;

/** A problem on a page with real impressions matters more than on a dead one. */
function weight(base: Severity, impressions: number): Severity {
  const order: Severity[] = ["low", "medium", "high", "critical"];
  const index = order.indexOf(base);
  if (impressions >= 1000 && index < order.length - 1) return order[index + 1];
  if (impressions < 10 && index > 0) return order[index - 1];
  return base;
}

export function runRules(input: RuleInput): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const { snapshots, siteFiles, metricsByUrl } = input;

  const metricsFor = (url: string): PageMetrics =>
    metricsByUrl.get(url) ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };

  // ---- site level ----

  if (siteFiles.robotsStatus !== 200) {
    findings.push({
      code: "robots_missing",
      severity: "medium",
      category: "technical",
      url: null,
      title: "robots.txt is not reachable",
      detail: `Requesting /robots.txt returned ${siteFiles.robotsStatus ?? "no response"}.`,
      suggestion:
        "Serve a robots.txt that allows crawling of indexable content and declares the sitemap URL.",
      evidence: { status: siteFiles.robotsStatus },
      autoFixable: false,
    });
  }

  if (siteFiles.sitemapUrls.length === 0) {
    findings.push({
      code: "sitemap_missing",
      severity: "high",
      category: "indexing",
      url: null,
      title: "No reachable XML sitemap",
      detail:
        siteFiles.brokenSitemaps.length > 0
          ? `These sitemap URLs did not return a document: ${siteFiles.brokenSitemaps.join(", ")}.`
          : "Neither robots.txt nor /sitemap.xml produced a sitemap.",
      suggestion:
        "Publish an XML sitemap of canonical URLs and reference it from robots.txt with a Sitemap: line.",
      evidence: { tried: siteFiles.brokenSitemaps },
      autoFixable: false,
    });
  }

  // ---- fetch failures ----

  // A 429/503 means *our* crawler was throttled, not that the page is broken.
  // Reporting those as page defects produced a screenful of false criticals, so
  // they are collapsed into a single informational note about crawl coverage.
  const throttled = snapshots.filter((page) => !page.ok && page.rateLimited);
  const genuinelyBroken = snapshots.filter((page) => !page.ok && !page.rateLimited);

  if (throttled.length > 0) {
    findings.push({
      code: "crawl_throttled",
      severity: "low",
      category: "technical",
      url: null,
      title: `${throttled.length} page(s) could not be audited — the host rate-limited the crawl`,
      detail:
        "These URLs returned 429/503 after retries, so their on-page checks are missing from this audit. " +
        "This says nothing about the pages themselves.",
      suggestion:
        "Re-run the audit later, or allowlist the AiMarketingDashboard user agent if the host lets you.",
      evidence: { urls: throttled.map((p) => p.url).slice(0, 20) },
      autoFixable: false,
    });
  }

  for (const page of genuinelyBroken) {
    const { impressions } = metricsFor(page.url);
    findings.push({
      code: "page_unreachable",
      severity: weight("high", impressions),
      category: "technical",
      url: page.url,
      title: "Page could not be fetched",
      detail: `${page.error ?? "Unknown error"} — this URL still receives ${impressions} impressions in Search Console.`,
      suggestion:
        "Confirm the URL still resolves. If it is retired, return 410 or redirect it to the closest live page.",
      evidence: { status: page.status, error: page.error },
      autoFixable: false,
    });
  }

  const live = snapshots.filter((page) => page.ok);

  // ---- AI search access (seo-geo / seo-technical) ----
  //
  // Separate from the robots.txt reachability check above: that one asks
  // whether the file exists, this one asks who it shuts out. Blocking an
  // answering crawler removes the site from AI answers entirely, which is a
  // ranking-scale consequence that nothing in Search Console reports.
  const { blocked, viaWildcard } = blockedAiCrawlers(siteFiles.robotsTxt);
  if (blocked.length > 0) {
    findings.push({
      code: "ai_crawlers_blocked",
      severity: viaWildcard ? "medium" : "high",
      category: "technical",
      url: null,
      title: `robots.txt blocks ${blocked.length} AI search crawler(s)`,
      detail:
        `${blocked.join(", ")} cannot fetch this site, so it cannot be cited in ` +
        `ChatGPT, Claude or Perplexity answers.` +
        (viaWildcard
          ? " They are caught by a blanket `User-agent: *` rule rather than named directly, so this may not have been deliberate."
          : " Each is named explicitly in robots.txt.") +
        " Training-only crawlers such as Google-Extended, Bytespider and CCBot are not counted here — blocking those costs nothing in AI search.",
      suggestion:
        "If AI visibility is wanted, add an explicit allow group per crawler. A named group overrides the wildcard: `User-agent: GPTBot` followed by `Disallow:` (empty) grants access without loosening anything else.",
      evidence: { blocked, viaWildcard },
      autoFixable: false,
    });
  }

  // ---- structured data that no longer earns rich results (seo-schema) ----
  const allJsonLdTypes = snapshots.flatMap((page) => page.jsonLdTypes);
  for (const { type, note } of withdrawnSchemaTypes(allJsonLdTypes)) {
    const affected = snapshots
      .filter((page) => page.jsonLdTypes.some((t) => t.toLowerCase() === type.toLowerCase()))
      .map((page) => page.url);

    findings.push({
      code: `schema_withdrawn_${type.toLowerCase()}`,
      severity: "low",
      category: "technical",
      url: affected[0] ?? null,
      title: `${type} markup no longer produces rich results`,
      detail:
        `${affected.length} page(s) carry ${type} schema — ${note}. The markup is not ` +
        "harmful and still helps AI systems resolve entities, so this is worth knowing " +
        "rather than fixing.",
      suggestion:
        `Keep it if it is already there. Do not invest further in ${type} for Google ` +
        "visibility, and do not roll it out to more pages on that basis.",
      evidence: { type, note, urls: affected.slice(0, 10) },
      autoFixable: false,
    });
  }

  // ---- per page ----

  for (const page of live) {
    const { impressions, ctr, position } = metricsFor(page.url);
    const push = (finding: Omit<RuleFinding, "url">) =>
      findings.push({ ...finding, url: page.url });

    if (page.finalUrl) {
      push({
        code: "page_redirects",
        severity: weight("medium", impressions),
        category: "indexing",
        title: "Ranking URL redirects elsewhere",
        detail: `Search Console reports traffic for this URL, but it redirects to ${page.finalUrl}.`,
        suggestion:
          "Point internal links and the sitemap at the destination so the redirect hop disappears.",
        evidence: { finalUrl: page.finalUrl },
        autoFixable: false,
      });
    }

    if (page.robotsMeta?.toLowerCase().includes("noindex")) {
      push({
        code: "noindex_on_ranking_page",
        severity: "critical",
        category: "indexing",
        title: "Page is marked noindex but still gets impressions",
        detail: `meta robots is "${page.robotsMeta}". Google will drop this page once it recrawls.`,
        suggestion: "Remove noindex if the page should rank; otherwise expect the traffic to disappear.",
        evidence: { robots: page.robotsMeta },
        autoFixable: false,
      });
    }

    if (!page.title) {
      push({
        code: "title_missing",
        severity: weight("critical", impressions),
        category: "onpage",
        title: "Missing <title>",
        detail: "The page has no title element, so Google invents one from page content.",
        suggestion: "Write a unique title under 60 characters leading with the target keyword.",
        evidence: null,
        autoFixable: true,
      });
    } else if (page.title.length > TITLE_MAX) {
      push({
        code: "title_too_long",
        severity: weight("medium", impressions),
        category: "onpage",
        title: `Title is ${page.title.length} characters`,
        detail: `Titles past roughly ${TITLE_MAX} characters get truncated in results. Current: "${page.title}"`,
        suggestion: `Trim to under ${TITLE_MAX} characters, keeping the keyword in the first half.`,
        evidence: { title: page.title, length: page.title.length },
        autoFixable: true,
      });
    } else if (page.title.length < TITLE_MIN) {
      push({
        code: "title_too_short",
        severity: "low",
        category: "onpage",
        title: `Title is only ${page.title.length} characters`,
        detail: `"${page.title}" leaves most of the available SERP width unused.`,
        suggestion: "Expand with a qualifier or the brand name.",
        evidence: { title: page.title, length: page.title.length },
        autoFixable: true,
      });
    }

    if (!page.metaDescription) {
      push({
        code: "meta_description_missing",
        severity: weight(ctr < 0.01 && impressions > 100 ? "high" : "medium", impressions),
        category: "onpage",
        title: "Missing meta description",
        detail:
          impressions > 0
            ? `Google auto-generates the snippet. This page has ${impressions} impressions at ${(ctr * 100).toFixed(2)}% CTR.`
            : "Google auto-generates the snippet from page text.",
        suggestion: `Write a ${DESC_MIN}–${DESC_MAX} character description that states the value proposition and invites the click.`,
        evidence: { impressions, ctr },
        autoFixable: true,
      });
    } else if (page.metaDescription.length > DESC_MAX) {
      push({
        code: "meta_description_too_long",
        severity: "low",
        category: "onpage",
        title: `Meta description is ${page.metaDescription.length} characters`,
        detail: `Anything past about ${DESC_MAX} characters is cut off.`,
        suggestion: `Tighten to under ${DESC_MAX} characters.`,
        evidence: { length: page.metaDescription.length },
        autoFixable: true,
      });
    }

    if (page.h1.length === 0) {
      push({
        code: "h1_missing",
        severity: "medium",
        category: "onpage",
        title: "No H1 heading",
        detail: "The page has no H1, weakening the topical signal.",
        suggestion: "Add exactly one H1 that restates the page topic.",
        evidence: null,
        autoFixable: false,
      });
    } else if (page.h1.length > 1) {
      push({
        code: "h1_multiple",
        severity: "low",
        category: "onpage",
        title: `${page.h1.length} H1 headings`,
        detail: `Multiple H1s dilute the topic signal: ${page.h1.slice(0, 3).map((h) => `"${h}"`).join(", ")}.`,
        suggestion: "Keep one H1 and demote the rest to H2.",
        evidence: { h1: page.h1 },
        autoFixable: false,
      });
    }

    if (!page.canonical) {
      push({
        code: "canonical_missing",
        severity: "medium",
        category: "indexing",
        title: "No canonical link",
        detail: "Without a canonical, parameter and duplicate URLs can split ranking signals.",
        suggestion: "Add a self-referencing <link rel=\"canonical\"> to every indexable page.",
        evidence: null,
        autoFixable: true,
      });
    }

    if (page.wordCount < THIN_CONTENT_WORDS) {
      push({
        code: "thin_content",
        severity: weight(position > 10 ? "medium" : "low", impressions),
        category: "content",
        title: `Only ${page.wordCount} words of body copy`,
        detail: `Pages under ${THIN_CONTENT_WORDS} words rarely satisfy informational intent. Average position is ${position.toFixed(1)}.`,
        suggestion: "Expand with specifics, or merge into a stronger page if it duplicates one.",
        evidence: { wordCount: page.wordCount, position },
        autoFixable: false,
      });
    }

    if (page.images > 0) {
      const missingRatio = page.imagesMissingAlt / page.images;
      if (missingRatio > 0.2) {
        push({
          code: "images_missing_alt",
          severity: missingRatio > 0.5 ? "medium" : "low",
          category: "content",
          title: `${page.imagesMissingAlt} of ${page.images} images have no alt text`,
          detail: "Missing alt text costs image search traffic and fails accessibility checks.",
          suggestion: "Describe each image in natural language; skip alt only for purely decorative images.",
          evidence: { images: page.images, missing: page.imagesMissingAlt },
          autoFixable: false,
        });
      }
    }

    if (page.jsonLdTypes.length === 0) {
      push({
        code: "structured_data_missing",
        severity: "low",
        category: "technical",
        title: "No JSON-LD structured data",
        detail: "The page declares no schema.org types, so it cannot qualify for rich results.",
        suggestion: "Add the type that matches the page — Product, Article, FAQPage, Organization.",
        evidence: null,
        autoFixable: false,
      });
    }
    if (page.jsonLdInvalid > 0) {
      push({
        code: "structured_data_invalid",
        severity: "medium",
        category: "technical",
        title: `${page.jsonLdInvalid} JSON-LD block(s) failed to parse`,
        detail: "Malformed JSON-LD is ignored entirely by Google.",
        suggestion: "Validate the block; a trailing comma or unescaped quote is the usual cause.",
        evidence: { invalidBlocks: page.jsonLdInvalid },
        autoFixable: false,
      });
    }

    if (!page.ogTitle || !page.ogDescription || !page.ogImage) {
      const missing = [
        !page.ogTitle && "og:title",
        !page.ogDescription && "og:description",
        !page.ogImage && "og:image",
      ].filter(Boolean);
      push({
        code: "open_graph_incomplete",
        severity: "low",
        category: "content",
        title: `Open Graph tags incomplete (${missing.join(", ")})`,
        detail: "Shared links will render without a proper preview card.",
        suggestion: "Add the missing og: tags; og:image should be at least 1200×630.",
        evidence: { missing },
        autoFixable: true,
      });
    }

    if (page.internalLinks < 3) {
      push({
        code: "few_internal_links",
        severity: "low",
        category: "content",
        title: `Only ${page.internalLinks} internal links`,
        detail: "Few internal links means little crawl equity flows onward from this page.",
        suggestion: "Link to 3–5 related pages using descriptive anchor text.",
        evidence: { internalLinks: page.internalLinks },
        autoFixable: false,
      });
    }

    if (!page.viewport) {
      push({
        code: "viewport_missing",
        severity: "high",
        category: "technical",
        title: "No viewport meta tag",
        detail: "Without it, mobile browsers render at desktop width and the page fails mobile usability.",
        suggestion: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
        evidence: null,
        autoFixable: true,
      });
    }

    if (!page.lang) {
      push({
        code: "html_lang_missing",
        severity: "low",
        category: "technical",
        title: "No lang attribute on <html>",
        detail: "Language is left for the crawler to guess, which matters most on multilingual sites.",
        suggestion: 'Set <html lang="en"> (or the page\'s actual language).',
        evidence: null,
        autoFixable: true,
      });
    }
  }

  // ---- cross-page duplicates ----

  findings.push(...duplicateFindings(live, "title", "Duplicate <title> across pages"));
  findings.push(
    ...duplicateFindings(live, "metaDescription", "Duplicate meta description across pages"),
  );

  return findings;
}

function duplicateFindings(
  pages: PageSnapshot[],
  field: "title" | "metaDescription",
  title: string,
): RuleFinding[] {
  const groups = new Map<string, string[]>();
  for (const page of pages) {
    const value = page[field];
    if (!value) continue;
    const bucket = groups.get(value);
    if (bucket) bucket.push(page.url);
    else groups.set(value, [page.url]);
  }

  return [...groups]
    .filter(([, urls]) => urls.length > 1)
    .map(([value, urls]) => ({
      code: `duplicate_${field}`,
      severity: "medium" as Severity,
      category: "onpage" as Category,
      url: urls[0],
      title,
      detail: `${urls.length} pages share "${value.slice(0, 80)}": ${urls.slice(0, 5).join(", ")}${urls.length > 5 ? "…" : ""}`,
      suggestion:
        field === "title"
          ? "Give each page a title that names what makes it different."
          : "Write a distinct description per page; duplicates get discarded by Google.",
      evidence: { value, urls },
      autoFixable: true,
    }));
}

/**
 * Deterministic score: start at 100 and deduct per finding, weighted by
 * severity and normalised by how many pages were inspected — so a 5-page site
 * and a 50-page site are scored on the same curve.
 */
export function scoreFromFindings(findings: RuleFinding[], pagesChecked: number): number {
  const cost: Record<Severity, number> = { critical: 12, high: 6, medium: 2.5, low: 0.8 };
  const raw = findings.reduce((sum, f) => sum + cost[f.severity], 0);
  const normalised = raw / Math.max(1, Math.sqrt(pagesChecked));
  return Math.max(0, Math.min(100, Math.round(100 - normalised * 3)));
}
