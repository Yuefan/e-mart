/**
 * End-to-end check of the configured AI gateway using a real app schema.
 *
 * `ai:check` verifies connectivity; this verifies the part that actually
 * breaks on third-party endpoints — whether structured output comes back in
 * the shape the jobs expect. Run it after changing AI_BASE_URL or
 * AI_STRUCTURED_MODE.
 */
import { callAi } from "../src/lib/ai/client";
import { seoAuditSchema } from "../src/lib/ai/schemas";

async function main() {
  const mode = process.env.AI_STRUCTURED_MODE === "tool" ? "tool" : "native";
  console.log(`base URL : ${process.env.AI_BASE_URL ?? "api.anthropic.com"}`);
  console.log(`model    : ${process.env.AI_MODEL_ANALYSIS ?? "(default)"}`);
  console.log(`mode     : ${mode}`);
  console.log("");

  const started = Date.now();
  const result = await callAi({
    task: "seo_audit",
    schema: seoAuditSchema,
    system:
      "You are an SEO analyst. Return findings for the supplied evidence. Be brief.",
    prompt:
      "Site: example.com. Evidence: the homepage has no <title>, two product " +
      "pages share the meta description 'Buy now', and there is no sitemap. " +
      "Produce a score, a one-line summary, two findings and one title rewrite.",
    promptVersion: "smoke-1",
    tier: "analysis",
    maxTokens: 2_000,
  });

  console.log(`OK in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`score          : ${result.data.score}`);
  console.log(`findings       : ${result.data.findings.length}`);
  console.log(`rewrites       : ${result.data.rewrites.length}`);
  console.log(`priorityActions: ${result.data.priorityActions.length}`);
  console.log(`summary        : ${result.data.summary.slice(0, 120)}`);
  console.log("");
  console.log(`model reported : ${result.usage.model}`);
  console.log(`tokens         : ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`);
  console.log(`cost           : $${result.usage.costUsd.toFixed(6)}`);
  if (result.usage.costUsd === 0) {
    console.log("  ^ zero means the model is missing from PRICING — spend will not be tracked.");
  }
}

main().catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
