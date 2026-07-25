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
