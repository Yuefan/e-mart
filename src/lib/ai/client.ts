import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { type ZodType, z } from "zod";
import { numberField } from "@/lib/json";
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

/**
 * USD per million tokens.
 *
 * `cacheRead` / `cacheWrite` default to Anthropic's ratios (0.1x and 1.25x of
 * input) and are stated explicitly where a provider prices them differently —
 * DeepSeek's cache hit is 2% of input, not 10%, and it has no separate write
 * charge, so leaving those implied would misreport spend by a wide margin.
 */
type ModelPrice = {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
};

const PRICING: Record<string, ModelPrice> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  // DeepSeek, via its Anthropic-compatible endpoint. A cache miss bills at the
  // normal input rate, so cacheWrite equals input.
  "deepseek-v4-pro": { input: 0.435, output: 0.87, cacheRead: 0.003625, cacheWrite: 0.435 },
  "deepseek-v4-flash": { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0.14 },
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

/**
 * How the model is made to return JSON.
 *
 * `native` uses Anthropic's `output_config`, which constrains decoding — the
 * strongest guarantee, but only Anthropic itself implements it. Compatible
 * endpoints from other providers accept the field and **silently ignore it**,
 * answering in prose with a 200; the schema check then fails on every call and
 * the failure looks like a model problem rather than a config one.
 *
 * `tool` forces a single-tool call instead. Tool calling is the part of the
 * Anthropic surface those endpoints do implement, so the result still arrives
 * as a typed object. Set AI_STRUCTURED_MODE=tool for DeepSeek and friends.
 */
function structuredMode(): "native" | "tool" {
  return process.env.AI_STRUCTURED_MODE === "tool" ? "tool" : "native";
}

/** Name of the synthetic tool used to carry the response in `tool` mode. */
const OUTPUT_TOOL = "emit_result";

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

  const cacheRead = price.cacheRead ?? price.input * 0.1;
  const cacheWrite = price.cacheWrite ?? price.input * 1.25;

  return (
    (usage.input * price.input +
      usage.cacheRead * cacheRead +
      usage.cacheWrite * cacheWrite +
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

  const [audits, articles] = await Promise.all([
    prisma.seoAudit.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { aiMeta: true },
    }),
    // Content generation is the other spender; leaving it out understated the
    // month and let the ceiling be walked straight past.
    prisma.article.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { aiMeta: true },
    }),
  ]);

  return [...audits, ...articles].reduce(
    (total, row) => total + (numberField(row.aiMeta, "costUsd") ?? 0),
    0,
  );
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

  const mode = structuredMode();
  // Built once: the conversion walks the whole schema and the result is reused
  // by the retry.
  const toolSchema =
    mode === "tool"
      ? (z.toJSONSchema(options.schema, { io: "output" }) as Record<string, unknown>)
      : null;

  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response =
      mode === "tool"
        ? await anthropic.messages.create({
            model,
            max_tokens: maxTokens,
            system: options.system,
            messages,
            tools: [
              {
                name: OUTPUT_TOOL,
                description: "Return the result. This is the only way to answer.",
                input_schema: toolSchema as Anthropic.Tool["input_schema"],
              },
            ],
            // "any" rather than pinning the name: it still guarantees a tool
            // call, and only one tool is offered so the effect is identical.
            // Naming the tool is rejected outright by reasoning models on
            // DeepSeek ("Thinking mode does not support this tool_choice"),
            // which would mean giving up thinking to get structured output.
            tool_choice: { type: "any" },
          })
        : await anthropic.messages.parse({
            model,
            max_tokens: maxTokens,
            system: options.system,
            messages,
            output_config: {
              format: zodOutputFormat(options.schema),
              effort: effort(),
            },
          });

    // In tool mode the payload is the tool call's input; in native mode the SDK
    // has already parsed it onto the response.
    const candidate: unknown =
      mode === "tool"
        ? (response.content.find((block) => block.type === "tool_use")?.input ?? null)
        : "parsed_output" in response
          ? response.parsed_output
          : null;

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
    } else if (candidate === null) {
      // Only reachable in tool mode: the endpoint ignored tool_choice and
      // replied with prose. Worth naming precisely, because the usual cause is
      // pointing AI_BASE_URL at something that only partly implements the API.
      lastError = new Error(
        `The model answered without calling ${OUTPUT_TOOL}. The endpoint at ` +
          `${process.env.AI_BASE_URL ?? "api.anthropic.com"} may not support forced tool use.`,
      );
    } else {
      const parsed = options.schema.safeParse(candidate);
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
          content: JSON.stringify(candidate ?? {}).slice(0, 2000),
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
