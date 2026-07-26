import type { PageSnapshot } from "./crawl";

/**
 * Audit methodology, vendored from the claude-seo skill set.
 *
 * The skills themselves cannot run here. They are instructions for the Claude
 * Code runtime — they spawn subagents, shell out, and call MCP servers — and
 * they live in ~/.claude/skills on a laptop, not in this container. What
 * transfers is the durable part: thresholds, status tables, scoring weights and
 * the shape of a good recommendation. That is what these playbooks carry.
 *
 * Two rules keep this honest:
 *
 * 1. Anything decidable from the crawl belongs in rules.ts, not here. Paying a
 *    model to notice that robots.txt blocks GPTBot is worse than a `grep` in
 *    every way — cost, latency, and reliability.
 * 2. Playbooks are selected per audit. Sending the e-commerce playbook to a
 *    blog spends tokens to make the model consider things that do not exist.
 *
 * Dates matter in this material: several schema types lost rich results
 * recently, and a model trained before then will happily recommend them.
 */

export type PlaybookId =
  | "core"
  | "technical"
  | "schema"
  | "geo"
  | "content"
  | "ecommerce"
  | "local"
  | "hreflang";

export type Playbook = {
  id: PlaybookId;
  title: string;
  /** Which skill the material came from, so drift can be traced back. */
  source: string;
  text: string;
};

const CORE: Playbook = {
  id: "core",
  title: "Scoring and synthesis",
  source: "seo",
  text: `SCORING WEIGHTS — weight the overall score by category:
Technical 22% · Content quality 23% · On-page 20% · Schema 10% · Performance 10% · AI search readiness 10% · Images 5%.

PRIORITY DEFINITIONS — use these exact meanings:
- critical: blocks indexing or risks a penalty. Fix now.
- high: materially suppresses rankings. Fix within a week.
- medium: real optimisation opportunity. Fix within a month.
- low: backlog.
Severity is the output of judgement, not a label sprinkled on findings. A defect
on a page with heavy impressions outranks the same defect on a page nobody sees.

EVERY RECOMMENDATION MUST CARRY:
- the observation it rests on, stated as fact from the evidence;
- what it unblocks, or what must land first;
- how the user would know it failed;
- a leading indicator they can watch without re-running the audit.
Do not emit a recommendation you cannot ground in the supplied evidence. If the
evidence is insufficient, say so instead of guessing.`,
};

const TECHNICAL: Playbook = {
  id: "technical",
  title: "Technical",
  source: "seo-technical",
  text: `CATEGORIES: crawlability, indexability, security, URL structure, mobile,
Core Web Vitals, structured data, JavaScript rendering, IndexNow.

CORE WEB VITALS TARGETS: LCP < 2.5s · INP < 200ms · CLS < 0.1.
Use INP. FID no longer exists — never mention it.

JAVASCRIPT RENDERING: AI crawlers do not execute JavaScript. Content that only
appears after hydration is invisible to them, whatever Googlebot manages.

Do not claim a Core Web Vitals or rendering measurement unless field data was
supplied — none is collected by this audit today. Frame those as "not measured"
rather than inventing a number.`,
};

const SCHEMA: Playbook = {
  id: "schema",
  title: "Structured data status",
  source: "seo-schema",
  text: `SCHEMA TYPE STATUS as of May 2026. This overrides older training data.

NEVER RECOMMEND (rich results withdrawn):
- HowTo (Sept 2023) · SpecialAnnouncement (Jul 2025) · ClaimReview (Jun 2025)
- CourseInfo, EstimatedSalary, LearningVideo (Jun 2025)
- VehicleListing (Jun 2025) · Practice Problem, Dataset (late 2025)

FAQPage: Google retired FAQ rich results for ALL sites on 7 May 2026. There is
no SERP feature left. Do not recommend adding FAQPage for Google visibility, and
do not recommend removing existing markup — it still helps AI Overviews resolve
entities. Flag existing FAQPage as informational only, never as a defect. For
genuine user-submitted Q&A, QAPage is the correct type.

Recommend freely: Organization, LocalBusiness, Article/BlogPosting, Product,
Breadcrumb, Event, Recipe, Review, VideoObject, Person.`,
};

const GEO: Playbook = {
  id: "geo",
  title: "AI search readiness",
  source: "seo-geo",
  text: `GEO CRITERIA and weights within the AI-readiness category:
citability 25% · structure 20% · authority 20% · technical access 20% · multi-modal 15%.

CITABILITY: self-contained passages of roughly 134-167 words are the most cited
unit. About 44% of AI citations come from the first 30% of a page, so the
quotable answer belongs above the fold, not in a conclusion. Prefer specific
facts, attributed claims and "X is..." definition patterns.

STRUCTURE: clean H1>H2>H3, question-shaped headings, 2-4 sentence paragraphs,
tables for comparisons, lists for sequences.

AUTHORITY: bylines with credentials, visible published and updated dates. Recency
is unusually strong here — content under three months old is roughly 3x more
likely to be cited, and pages untouched for six months lose eligibility. A
scheduled refresh programme is often the highest-leverage single change.

TECHNICAL ACCESS: AI crawlers do not run JavaScript, and they must be allowed in
robots.txt. Brand mentions correlate with AI citation far more strongly than
backlinks do, so treat "get mentioned" as a distinct workstream from link
building.`,
};

const CONTENT: Playbook = {
  id: "content",
  title: "Content quality gates",
  source: "seo-content, seo/quality-gates",
  text: `MINIMUM WORD COUNTS by page type (below this is thin):
homepage 500 · service/feature 800 · blog post 1500 · product 400 · category 400
· about 400 · landing 600 · FAQ 800 · location page 500-600.

LOCATION PAGES: warn at 30+ and demand 60%+ unique content per page; at 50+ treat
it as a doorway-page risk needing explicit justification. The tell is pages where
only the city name changes.

E-E-A-T: experience (first-hand evidence), expertise (credentials), authority
(citations and mentions), trust (contactability, transparency, accuracy).

AI-WRITTEN CONTENT is acceptable when it is reviewed, adds something, and is
accountable to a named person. The markers of the bad kind are hedged filler,
restated headings, no first-hand detail and no sources.`,
};

const ECOMMERCE: Playbook = {
  id: "ecommerce",
  title: "E-commerce",
  source: "seo-ecommerce",
  text: `PRODUCT PAGES: Product schema with offers, price, availability and
aggregateRating where genuine. Unique descriptions — a manufacturer blurb reused
across retailers competes with every other retailer using it.

CATEGORY PAGES need unique introductory copy, not just a product grid.

Watch for: variant URLs competing with each other, out-of-stock pages returning
200 with no alternative, faceted navigation generating crawlable permutations.`,
};

const LOCAL: Playbook = {
  id: "local",
  title: "Local",
  source: "seo-local",
  text: `LOCAL SIGNALS: LocalBusiness schema with consistent NAP, embedded map,
service-area statements, and a Google Business Profile that matches the site
exactly. NAP inconsistency across the web is the most common quiet defect.

Location pages must carry genuinely local content — neighbourhoods, local staff,
real local reviews — not a template with the city swapped.`,
};

const HREFLANG: Playbook = {
  id: "hreflang",
  title: "Hreflang",
  source: "seo-hreflang",
  text: `HREFLANG must be reciprocal: every alternate has to point back, or the
cluster is ignored. Include a self-referencing tag. Use x-default for the
unmatched-language fallback. Language codes are ISO 639-1, optionally with an
ISO 3166-1 region — "en-UK" is invalid, "en-GB" is correct.`,
};

const ALL: Playbook[] = [CORE, TECHNICAL, SCHEMA, GEO, CONTENT, ECOMMERCE, LOCAL, HREFLANG];

/** Case-insensitive membership test over the JSON-LD @type values found. */
function hasType(pages: PageSnapshot[], ...types: string[]): boolean {
  const wanted = types.map((t) => t.toLowerCase());
  return pages.some((page) =>
    page.jsonLdTypes.some((type) => wanted.includes(type.toLowerCase())),
  );
}

function anyUrlMatches(pages: PageSnapshot[], pattern: RegExp): boolean {
  return pages.some((page) => pattern.test(page.url));
}

/**
 * Picks the playbooks worth sending for this site.
 *
 * Selection is evidence-driven rather than "send everything": each unused
 * playbook is prompt the model has to read and the account has to pay for, and
 * material about products on a site with no products invites invented findings.
 */
export function selectPlaybooks(pages: PageSnapshot[]): Playbook[] {
  const selected: PlaybookId[] = ["core", "technical", "schema", "geo", "content"];

  if (hasType(pages, "Product", "Offer", "AggregateOffer") ||
      anyUrlMatches(pages, /\/(products?|collections?|cart|shop)(\/|$|\?)/i)) {
    selected.push("ecommerce");
  }

  if (hasType(pages, "LocalBusiness", "Restaurant", "Store", "ProfessionalService")) {
    selected.push("local");
  }

  // Only useful once the site is actually multilingual — otherwise the advice
  // has nothing to attach to.
  if (pages.some((page) => page.hreflang.length > 0)) {
    selected.push("hreflang");
  }

  return ALL.filter((playbook) => selected.includes(playbook.id));
}

/** Rendered into the prompt; the ids are recorded on the audit for traceability. */
export function renderPlaybooks(playbooks: Playbook[]): string {
  return playbooks
    .map((playbook) => `## ${playbook.title} [${playbook.source}]\n${playbook.text}`)
    .join("\n\n");
}
