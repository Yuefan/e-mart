import type { Outline, TopicIdea } from "@/lib/ai/schemas";

export const PROMPT_VERSION = "content.v1";

// ---- shared framing ----

const HOUSE_RULES = `Rules that apply to everything you write here:

- Write for someone deciding whether to act, not for a word count. Cut any
  sentence that would not change what the reader does next.
- Never invent statistics, dates, prices, study results, or quotes. If a claim
  needs a source you do not have, write the claim so it does not need one, or
  leave it out.
- No throat-clearing openers ("In today's fast-paced world"), no summary
  paragraph that repeats what was just said, no "in conclusion".
- Vary sentence length. Do not open consecutive paragraphs with the same word.`;

// ---- step 1: topic selection ----

export type IdeationInput = {
  site: { name: string; domain: string };
  brandVoice: string | null;
  opportunityQueries: { value: string; impressions: number; ctr: number; position: number }[];
  topQueries: { value: string; clicks: number; impressions: number; position: number }[];
  existingTitles: string[];
  count: number;
};

export const IDEATION_SYSTEM = `You pick what a site should publish next, using its own Search Console data.

The best candidate is usually a query the site already ranks for badly — real
demand, proven relevance, no ranking yet. A query with 900 impressions at
position 14 is worth more than a higher-volume term the site has no claim to.

${HOUSE_RULES}

Score estValue 0-100 relative to the other candidates in this batch, and say in
the rationale which numbers drove it. Do not propose anything that duplicates an
existing title.`;

export function buildIdeationPrompt(input: IdeationInput): string {
  const sections = [
    `## Site\n${input.site.name} (${input.site.domain})`,
    input.brandVoice ? `## Brand voice\n${input.brandVoice}` : null,
    input.opportunityQueries.length
      ? `## Queries with demand but weak rankings\n${input.opportunityQueries
          .map(
            (q) =>
              `- "${q.value}" impressions=${q.impressions} ctr=${(q.ctr * 100).toFixed(2)}% position=${q.position.toFixed(1)}`,
          )
          .join("\n")}`
      : null,
    input.topQueries.length
      ? `## Queries the site already wins (for context — do not just rewrite these)\n${input.topQueries
          .map((q) => `- "${q.value}" clicks=${q.clicks} position=${q.position.toFixed(1)}`)
          .join("\n")}`
      : null,
    input.existingTitles.length
      ? `## Already published — do not duplicate\n${input.existingTitles.map((t) => `- ${t}`).join("\n")}`
      : "## Already published\n(nothing yet)",
    `## Task\nPropose exactly ${input.count} topics as JSON matching the schema.`,
  ];

  return sections.filter(Boolean).join("\n\n");
}

// ---- step 2: outline ----

export type OutlineInput = {
  topic: TopicIdea;
  brandVoice: string | null;
  /** Existing pages available as internal link destinations. */
  linkTargets: { url: string; title: string }[];
  wordCountRange: [number, number];
};

export const OUTLINE_SYSTEM = `You plan the structure of one article before it is written.

A good outline makes the writing decisions that are hard to fix later: what
ground each section covers, where the keyword appears naturally, and which
existing pages get linked from where. It does not write the prose.

${HOUSE_RULES}

Only propose internal links to URLs given to you. Never invent a destination.`;

export function buildOutlinePrompt(input: OutlineInput): string {
  const [min, max] = input.wordCountRange;
  return [
    `## Topic\n${input.topic.title}`,
    `Target keyword: ${input.topic.targetKeyword}`,
    `Search intent: ${input.topic.searchIntent}`,
    `Angle: ${input.topic.angle}`,
    input.brandVoice ? `## Brand voice\n${input.brandVoice}` : null,
    input.linkTargets.length
      ? `## Internal link destinations\n${input.linkTargets
          .map((t) => `- ${t.url} — ${t.title}`)
          .join("\n")}`
      : "## Internal link destinations\n(none available yet — return an empty list)",
    `## Task
Plan a ${min}-${max} word article. Use H2 for main sections and H3 only where a
section genuinely splits. Aim for a heading roughly every 300 words. Include a
FAQ block of questions real searchers would ask. Return JSON matching the schema.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---- step 3: body ----

export type ArticleInput = {
  topic: TopicIdea;
  outline: Outline;
  brandVoice: string | null;
  wordCountRange: [number, number];
  domain: string;
};

export const ARTICLE_SYSTEM = `You write the article from an approved outline.

Follow the outline's structure. Where it lists points for a section, cover all
of them. Where it specifies an internal link, place that link with the given
anchor text as a Markdown link.

${HOUSE_RULES}

Formatting:
- Markdown only. No front matter, no wrapping code fence.
- Do not repeat the article title as an H1 — the page template renders it.
- Use {{IMAGE_1}}, {{IMAGE_2}} on their own lines where an illustration would
  genuinely help. Two or three at most. Leave them as literal placeholders.
- metaTitle: under 60 characters, keyword in the first half.
- metaDesc: 70-155 characters, written to earn the click.
- slug: lowercase, hyphenated, no stop words, derived from the keyword.`;

export function buildArticlePrompt(input: ArticleInput): string {
  const [min, max] = input.wordCountRange;
  const outline = input.outline.sections
    .map(
      (section) =>
        `${"#".repeat(section.level)} ${section.heading}\n${section.points
          .map((p) => `  - ${p}`)
          .join("\n")}`,
    )
    .join("\n\n");

  return [
    `## Topic\n${input.topic.title}\nTarget keyword: ${input.topic.targetKeyword}\nIntent: ${input.topic.searchIntent}\nAngle: ${input.topic.angle}`,
    input.brandVoice ? `## Brand voice\n${input.brandVoice}` : null,
    `## Approved outline\n${outline}`,
    `## Keyword plan\n${input.outline.keywordPlan}`,
    input.outline.internalLinkAnchors.length
      ? `## Internal links to place\n${input.outline.internalLinkAnchors
          .map((l) => `- [${l.anchor}](${l.url}) — ${l.placement}`)
          .join("\n")}`
      : null,
    input.outline.faqQuestions.length
      ? `## FAQ questions to answer\n${input.outline.faqQuestions.map((q) => `- ${q}`).join("\n")}`
      : null,
    `## Task\nWrite the full article, ${min}-${max} words. Return JSON matching the schema.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---- step 5: self-check ----

export type SelfCheckInput = {
  bodyMd: string;
  metaTitle: string;
  metaDesc: string;
  slug: string;
  targetKeyword: string;
  forbidden: string[];
  /** Deterministic problems already found — the model should not re-report these. */
  mechanicalIssues: string[];
};

export const SELF_CHECK_SYSTEM = `You review a draft before a human sees it.

Mechanical checks (lengths, slug format, forbidden words, keyword density) have
already run and their results are given to you. Do not repeat them.

Look for what only a reader catches: claims stated as fact that would need a
source, sections that promise something the article never delivers, advice that
contradicts itself, and passages that pad rather than inform.

Mark an issue a blocker only if publishing as-is would embarrass the author.
Everything else is a warning.`;

export function buildSelfCheckPrompt(input: SelfCheckInput): string {
  return [
    `## Meta\ntitle: ${input.metaTitle}\ndescription: ${input.metaDesc}\nslug: ${input.slug}\ntarget keyword: ${input.targetKeyword}`,
    input.forbidden.length ? `## Forbidden terms\n${input.forbidden.join(", ")}` : null,
    input.mechanicalIssues.length
      ? `## Already flagged mechanically (do not repeat)\n${input.mechanicalIssues.map((i) => `- ${i}`).join("\n")}`
      : "## Already flagged mechanically\n(nothing)",
    `## Draft\n${input.bodyMd}`,
    "## Task\nReturn JSON matching the schema.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
