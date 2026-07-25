import { z } from "zod";

/**
 * Long-lived per-site context fed to every content call (spec §5.3).
 *
 * Stored as JSON on Site.brandVoice. Everything is optional — a half-filled
 * profile is more useful than an empty one, and the prompt formatter simply
 * omits what is missing.
 */
export const brandVoiceSchema = z.object({
  tone: z.string().default(""),
  audience: z.string().default(""),
  /** BCP-47, e.g. en-US. Drives the language the model writes in. */
  language: z.string().default("en-US"),
  coreTopics: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  /** Words and claims the brand refuses to make. */
  forbidden: z.array(z.string()).default([]),
  wordCountRange: z.tuple([z.number(), z.number()]).default([1200, 1800]),
  referenceUrls: z.array(z.string()).default([]),
  imageStyle: z.string().default(""),
});

export type BrandVoice = z.infer<typeof brandVoiceSchema>;

export const EMPTY_BRAND_VOICE: BrandVoice = brandVoiceSchema.parse({});

/** Reads the jsonb column straight through Zod — no JSON.parse step. */
export function parseBrandVoice(stored: unknown): BrandVoice | null {
  if (!stored) return null;
  const parsed = brandVoiceSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

/** True once there is enough here to be worth sending to the model. */
export function isBrandVoiceUsable(voice: BrandVoice | null): boolean {
  if (!voice) return false;
  return Boolean(voice.tone || voice.audience || voice.coreTopics.length);
}

/**
 * Renders the profile as prompt text. Prose rather than JSON — the model
 * follows instructions written as instructions more reliably than it follows
 * a serialised object.
 */
export function formatBrandVoiceForPrompt(voice: BrandVoice | null): string | null {
  if (!isBrandVoiceUsable(voice) || !voice) return null;

  const lines: string[] = [];
  if (voice.tone) lines.push(`Tone: ${voice.tone}`);
  if (voice.audience) lines.push(`Audience: ${voice.audience}`);
  if (voice.language) lines.push(`Write in: ${voice.language}`);
  if (voice.coreTopics.length) lines.push(`Core topics: ${voice.coreTopics.join(", ")}`);
  if (voice.keywords.length) lines.push(`Priority keywords: ${voice.keywords.join(", ")}`);
  if (voice.forbidden.length) {
    lines.push(
      `Never use these words or make these claims: ${voice.forbidden.join(", ")}. ` +
        "This is a hard constraint, not a preference.",
    );
  }
  const [min, max] = voice.wordCountRange;
  lines.push(`Target length: ${min}-${max} words.`);
  if (voice.referenceUrls.length) {
    lines.push(`Existing pieces that set the house style: ${voice.referenceUrls.join(", ")}`);
  }
  if (voice.imageStyle) lines.push(`Image style: ${voice.imageStyle}`);

  return lines.join("\n");
}

/** Comma/newline separated text -> trimmed list, for the settings form. */
export function parseList(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
