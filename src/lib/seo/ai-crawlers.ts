/**
 * robots.txt rules that matter for AI search, plus the schema types that no
 * longer earn rich results.
 *
 * Both are decidable from evidence already collected, so they are checks rather
 * than prompt material. That matters beyond cost: a rule reports the same thing
 * every run, and a model asked to remember a withdrawal date will eventually
 * recommend HowTo again because most of its training data predates the change.
 */

/** Bots that read pages to answer questions — blocking these removes you from AI answers. */
export const AI_SEARCH_CRAWLERS = [
  { token: "GPTBot", owner: "OpenAI", purpose: "ChatGPT browsing and search" },
  { token: "OAI-SearchBot", owner: "OpenAI", purpose: "OpenAI search features" },
  { token: "ChatGPT-User", owner: "OpenAI", purpose: "user-initiated fetches" },
  { token: "ClaudeBot", owner: "Anthropic", purpose: "Claude browsing" },
  { token: "PerplexityBot", owner: "Perplexity", purpose: "Perplexity index" },
] as const;

/**
 * Blocking these costs nothing in AI search — they feed model training, not
 * answers. Kept separate so the audit never nags about a deliberate, and
 * entirely reasonable, opt-out of training.
 */
export const TRAINING_ONLY_CRAWLERS = ["Google-Extended", "Bytespider", "CCBot"] as const;

type RobotsGroup = { agents: string[]; disallowAll: boolean };

/**
 * Minimal robots.txt parse: which user-agent groups disallow everything.
 *
 * Deliberately narrow. A full matcher would have to model path precedence and
 * Allow/Disallow conflicts, and the only question asked here is the blunt one —
 * is this crawler shut out of the whole site.
 */
function parseGroups(robotsTxt: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  // Consecutive User-agent lines share one rule block; a directive ends the run.
  let collectingAgents = false;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;

    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;

    const field = match[1].toLowerCase();
    const value = match[2].trim();

    if (field === "user-agent") {
      if (!collectingAgents || !current) {
        current = { agents: [], disallowAll: false };
        groups.push(current);
        collectingAgents = true;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    collectingAgents = false;
    if (!current) continue;

    // "Disallow: /" bars everything; an empty Disallow explicitly allows.
    if (field === "disallow" && value === "/") current.disallowAll = true;
  }

  return groups;
}

/** Crawlers barred from the whole site, by their own name or by a `*` group. */
export function blockedAiCrawlers(robotsTxt: string | null): {
  blocked: string[];
  viaWildcard: boolean;
} {
  if (!robotsTxt) return { blocked: [], viaWildcard: false };

  const groups = parseGroups(robotsTxt);
  const wildcardBlocks = groups.some(
    (group) => group.agents.includes("*") && group.disallowAll,
  );

  const blocked = AI_SEARCH_CRAWLERS.filter(({ token }) => {
    const name = token.toLowerCase();
    const named = groups.find((group) => group.agents.includes(name));
    // A named group replaces the wildcard for that crawler, so an explicit
    // group that allows access wins over a blanket `User-agent: *` block.
    if (named) return named.disallowAll;
    return wildcardBlocks;
  }).map(({ token }) => token);

  return { blocked, viaWildcard: wildcardBlocks && blocked.length > 0 };
}

/**
 * Schema types Google no longer shows rich results for, with the date it
 * stopped — the date is what makes the finding arguable rather than assertion.
 */
export const WITHDRAWN_SCHEMA: Record<string, string> = {
  howto: "rich results removed September 2023",
  specialannouncement: "deprecated 31 July 2025",
  claimreview: "retired from rich results June 2025",
  courseinfo: "retired June 2025",
  estimatedsalary: "retired June 2025",
  learningvideo: "retired June 2025",
  vehiclelisting: "retired from rich results June 2025",
  dataset: "retired from rich results late 2025",
};

/** Present markup that no longer earns a SERP feature. */
export function withdrawnSchemaTypes(types: string[]): { type: string; note: string }[] {
  // Keyed by the lowercased name so "HowTo" and "howto" across different pages
  // collapse into one finding; the first spelling seen is kept for display.
  const seen = new Map<string, { type: string; note: string }>();

  for (const type of types) {
    const key = type.toLowerCase();
    const note = WITHDRAWN_SCHEMA[key];
    if (note && !seen.has(key)) seen.set(key, { type, note });
  }

  return [...seen.values()];
}
