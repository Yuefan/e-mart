import { z } from "zod";

/**
 * Structured-output contracts. These are sent to the model as a JSON schema
 * and re-validated here, so a malformed response fails loudly instead of
 * being written to the database (spec §6.2).
 *
 * Constraints stay loose on purpose: the rule engine already measures lengths
 * deterministically, and a hard `.max()` here would turn a slightly-long
 * suggestion into a failed job.
 */

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export const CATEGORIES = [
  "technical",
  "content",
  "onpage",
  "performance",
  "indexing",
] as const;

export const aiFindingSchema = z.object({
  severity: z.enum(SEVERITIES),
  category: z.enum(CATEGORIES),
  /** Null when the finding is site-wide rather than page-specific. */
  url: z.string().nullable(),
  title: z.string(),
  /** What the evidence shows. */
  detail: z.string(),
  /** What to do about it, concretely. */
  suggestion: z.string(),
});

export const aiRewriteSchema = z.object({
  url: z.string(),
  field: z.enum(["title", "metaDescription"]),
  /** Ready-to-paste replacement text. */
  value: z.string(),
  rationale: z.string(),
});

export const seoAuditSchema = z.object({
  /** 0–100, weighted by how much traffic the problems actually touch. */
  score: z.number(),
  summary: z.string(),
  /** The 3–5 things worth doing first, in order. */
  priorityActions: z.array(z.string()),
  /**
   * Findings the rule engine cannot produce — cross-signal correlations and
   * judgement calls. Never restatements of the deterministic checks.
   */
  findings: z.array(aiFindingSchema),
  /** Concrete rewrites for the highest-value pages. */
  rewrites: z.array(aiRewriteSchema),
});

export type SeoAuditOutput = z.infer<typeof seoAuditSchema>;
export type AiFinding = z.infer<typeof aiFindingSchema>;
export type AiRewrite = z.infer<typeof aiRewriteSchema>;

// ---- content pipeline (spec §5.3) ----

export const SEARCH_INTENTS = [
  "informational",
  "commercial",
  "transactional",
  "navigational",
] as const;

export const topicIdeaSchema = z.object({
  title: z.string(),
  targetKeyword: z.string(),
  searchIntent: z.enum(SEARCH_INTENTS),
  /** The specific take that makes this worth publishing over what already ranks. */
  angle: z.string(),
  /** 0-100. Expected value relative to the other candidates in this batch. */
  estValue: z.number(),
  /** Why this scored the way it did, tied to the Search Console evidence. */
  rationale: z.string(),
});

export const topicIdeasSchema = z.object({
  topics: z.array(topicIdeaSchema),
});

export const outlineSectionSchema = z.object({
  heading: z.string(),
  level: z.union([z.literal(2), z.literal(3)]),
  /** Bullet points the section must cover. */
  points: z.array(z.string()),
});

export const outlineSchema = z.object({
  sections: z.array(outlineSectionSchema),
  /** Where the target keyword and its variants should appear. */
  keywordPlan: z.string(),
  /** Anchor texts to use for links to existing pages on the site. */
  internalLinkAnchors: z.array(
    z.object({ url: z.string(), anchor: z.string(), placement: z.string() }),
  ),
  /** Questions to answer in a FAQ block, aimed at People Also Ask. */
  faqQuestions: z.array(z.string()),
});

export const articleSchema = z.object({
  /** Full body in Markdown. Image slots appear as {{IMAGE_1}} placeholders. */
  bodyMd: z.string(),
  metaTitle: z.string(),
  metaDesc: z.string(),
  slug: z.string(),
  excerpt: z.string(),
});

export const selfCheckSchema = z.object({
  passed: z.boolean(),
  issues: z.array(
    z.object({
      severity: z.enum(["blocker", "warning"]),
      message: z.string(),
    }),
  ),
  /** Claims that would need a source before publishing. */
  unsupportedClaims: z.array(z.string()),
});

export type TopicIdea = z.infer<typeof topicIdeaSchema>;
export type TopicIdeas = z.infer<typeof topicIdeasSchema>;
export type Outline = z.infer<typeof outlineSchema>;
export type ArticleDraft = z.infer<typeof articleSchema>;
export type SelfCheck = z.infer<typeof selfCheckSchema>;
