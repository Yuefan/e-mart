/**
 * Verifies the AI gateway end to end: connectivity, model, structured output,
 * and what one round trip actually costs.
 *
 *   npm run ai:check
 */
import "../src/lib/load-env"; // must precede any import that reads process.env
import { z } from "zod";
import { callAi, isAiConfigured, monthlyBudgetUsd, monthlySpendUsd } from "../src/lib/ai/client";

const probeSchema = z.object({
  ok: z.boolean(),
  echo: z.string(),
});

async function main() {
  if (!isAiConfigured()) {
    console.error("AI_API_KEY is not set. See docs/ai-gateway-setup.md.");
    process.exitCode = 1;
    return;
  }

  console.log(`base URL : ${process.env.AI_BASE_URL || "https://api.anthropic.com (direct)"}`);
  console.log(`model    : ${process.env.AI_MODEL_ANALYSIS || "claude-opus-5"}`);
  console.log(`effort   : ${process.env.AI_EFFORT || "medium"}`);

  const spent = await monthlySpendUsd();
  console.log(`budget   : $${spent.toFixed(4)} used of $${monthlyBudgetUsd().toFixed(2)} this month\n`);

  const started = Date.now();
  try {
    const result = await callAi({
      task: "self_check",
      schema: probeSchema,
      system: "You are a connectivity probe. Answer with the requested JSON and nothing else.",
      prompt: 'Return {"ok": true, "echo": "pong"}.',
      promptVersion: "ai_check.v1",
      tier: "analysis",
      maxTokens: 2_000,
    });

    console.log(`✔ reachable in ${Date.now() - started}ms`);
    console.log(`  response       : ${JSON.stringify(result.data)}`);
    console.log(`  model reported : ${result.usage.model}`);
    console.log(
      `  tokens         : ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`,
    );
    console.log(`  cost           : $${result.usage.costUsd.toFixed(5)}`);
  } catch (error) {
    console.error(`✘ failed after ${Date.now() - started}ms`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    const cause = (error as { cause?: { code?: string } })?.cause;
    if (cause?.code) console.error(`  cause: ${cause.code}`);
    console.error("\nSee docs/ai-gateway-setup.md for the common causes.");
    process.exitCode = 1;
  }
}

void main();
