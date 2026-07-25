import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ZodType } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * AI access layer (spec §6.2).
 *
 * Uses the official Anthropic SDK rather than an OpenAI-compatible shim. The
 * spec's relay (New API / LiteLLM) is still honoured via `AI_BASE_URL` — both
 * expose an Anthropic-native `/v1/messages` endpoint, and the SDK's baseURL
 * override points at it. Leave AI_BASE_URL unset to talk to Anthropic directly.
 */

export type AiTask =
  | "seo_audit"
  | "topic_ideation"
  | "outline"
  | "article"
  | "self_check"
  | "alt_text";

export type AiCallOptions<T> = {
  task: AiTask;
  /** Forces JSON output and re-validates the result server-side. */
  schema: ZodType<T>;
  system: string;
  prompt: string;
  /** Bumped whenever the prompt text changes, so results stay traceable. */
  promptVersion: string;
  /** "analysis" uses the strong model, "fast" the cheap one. */
  tier?: "analysis" | "fast";
  maxTokens?: number;
};

export type AiUsage = {
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
};

export type AiResult<T> = {
  data: T;
  usage: AiUsage;
};

/** USD per million tokens. Cache reads bill at 0.1x input, writes at 1.25x. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const DEFAULT_ANALYSIS_MODEL = "claude-opus-5";
const DEFAULT_FAST_MODEL = "claude-haiku-4-5";
const REQUEST_TIMEOUT_MS = 180_000;

export class AiConfigError extends Error {}
export class AiBudgetError extends Error {}
export class AiRefusalError extends Error {}

export function isAiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY);
}

function client(): Anthropic {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    throw new AiConfigError(
      "AI_API_KEY is not set — add it to .env (see docs/ai-gateway-setup.md).",
    );
  }

  return new Anthropic({
    apiKey,
    // Unset = api.anthropic.com. Set = the relay from spec §6.1.
    ...(process.env.AI_BASE_URL ? { baseURL: process.env.AI_BASE_URL } : {}),
    timeout: REQUEST_TIMEOUT_MS,
    // 429 / 5xx / connection errors, with exponential backoff.
    maxRetries: 3,
  });
}

function modelFor(tier: "analysis" | "fast"): string {
  return tier === "fast"
    ? (process.env.AI_MODEL_FAST || DEFAULT_FAST_MODEL)
    : (process.env.AI_MODEL_ANALYSIS || DEFAULT_ANALYSIS_MODEL);
}

function effort(): "low" | "medium" | "high" | "xhigh" | "max" {
  const value = process.env.AI_EFFORT;
  const allowed = ["low", "medium", "high", "xhigh", "max"] as const;
  return allowed.includes(value as (typeof allowed)[number])
    ? (value as (typeof allowed)[number])
    : "medium";
}

function estimateCost(
  model: string,
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number },
): number {
  const price = PRICING[model];
  if (!price) return 0; // unknown model — report 0 rather than invent a number
  return (
    (usage.input * price.input +
      usage.cacheRead * price.input * 0.1 +
      usage.cacheWrite * price.input * 1.25 +
      usage.output * price.output) /
    1_000_000
  );
}

// ---- monthly budget (spec §6.2) ----

export function monthlyBudgetUsd(): number {
  const parsed = Number(process.env.AI_MAX_MONTHLY_USD);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
}

/** Month-to-date spend, summed from the aiMeta recorded on each audit. */
export async function monthlySpendUsd(): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const audits = await prisma.seoAudit.findMany({
    where: { createdAt: { gte: monthStart }, aiMeta: { not: null } },
    select: { aiMeta: true },
  });

  let total = 0;
  for (const audit of audits) {
    try {
      const meta = JSON.parse(audit.aiMeta!) as { costUsd?: number };
      if (typeof meta.costUsd === "number") total += meta.costUsd;
    } catch {
      // Malformed row — skip rather than fail the budget check.
    }
  }
  return total;
}

async function assertWithinBudget(): Promise<void> {
  const [spent, budget] = [await monthlySpendUsd(), monthlyBudgetUsd()];
  if (spent >= budget) {
    throw new AiBudgetError(
      `Monthly AI budget exhausted: $${spent.toFixed(2)} of $${budget.toFixed(2)}. ` +
        "Raise AI_MAX_MONTHLY_USD or wait for the next month.",
    );
  }
}

/**
 * One structured AI call.
 *
 * Output is constrained by JSON schema and re-validated with Zod on our side;
 * a validation failure is retried once with the error fed back, then gives up
 * so the caller can fail the job rather than persist garbage.
 */
export async function callAi<T>(options: AiCallOptions<T>): Promise<AiResult<T>> {
  await assertWithinBudget();

  const anthropic = client();
  const model = modelFor(options.tier ?? "analysis");
  const maxTokens = options.maxTokens ?? 16_000;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: options.prompt },
  ];

  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await anthropic.messages.parse({
      model,
      max_tokens: maxTokens,
      system: options.system,
      messages,
      output_config: {
        format: zodOutputFormat(options.schema),
        effort: effort(),
      },
    });

    const usage: AiUsage = {
      model: response.model,
      promptVersion: options.promptVersion,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      costUsd: 0,
    };
    usage.costUsd = estimateCost(response.model, {
      input: usage.inputTokens,
      output: usage.outputTokens,
      cacheRead: usage.cacheReadTokens,
      cacheWrite: usage.cacheWriteTokens,
    });

    // Safety classifiers can decline; content is empty or partial. Never treat
    // this as a parse failure — retrying the same prompt will decline again.
    if (response.stop_reason === "refusal") {
      throw new AiRefusalError(
        `The model declined this request (${response.stop_details?.category ?? "unspecified"}).`,
      );
    }

    if (response.stop_reason === "max_tokens") {
      lastError = new Error(
        `Response hit max_tokens (${maxTokens}) before completing. Raise maxTokens for task "${options.task}".`,
      );
    } else {
      const parsed = options.schema.safeParse(response.parsed_output);
      if (parsed.success) return { data: parsed.data, usage };
      lastError = new Error(
        `Schema validation failed: ${parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .slice(0, 5)
          .join("; ")}`,
      );
    }

    if (attempt === 1) {
      // Feed the failure back so the retry can correct itself.
      messages.push(
        {
          role: "assistant",
          content: JSON.stringify(response.parsed_output ?? {}).slice(0, 2000),
        },
        {
          role: "user",
          content:
            `That response was rejected: ${(lastError as Error).message}\n` +
            "Return corrected JSON matching the schema exactly. No prose.",
        },
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI call failed");
}
