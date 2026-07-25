/**
 * Deterministic draft checks. Same split as the SEO rule engine: anything code
 * can measure is measured here and never spent on tokens, and the results also
 * drive the live SEO bar in the editor.
 */

export const META_TITLE_MAX = 60;
export const META_DESC_MIN = 70;
export const META_DESC_MAX = 155;
/** Density outside this band reads as either thin or stuffed. */
export const KEYWORD_DENSITY_MIN = 0.005;
export const KEYWORD_DENSITY_MAX = 0.025;
export const WORDS_PER_HEADING_MAX = 400;

export type MarkdownStats = {
  wordCount: number;
  headings: { level: number; text: string }[];
  /** Longest run of words between two headings. */
  longestSectionWords: number;
  internalLinks: number;
  externalLinks: number;
  imagePlaceholders: string[];
  imagesWithAlt: number;
  imagesWithoutAlt: number;
  hasFaq: boolean;
};

const PLACEHOLDER_PATTERN = /\{\{IMAGE_\d+\}\}/g;

/** Strips syntax so word counts reflect prose, not Markdown punctuation. */
function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[#>\-*+\s]+/gm, " ")
    .replace(PLACEHOLDER_PATTERN, " ")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function countWords(text: string): number {
  const plain = toPlainText(text);
  // CJK has no spaces, so count those characters individually.
  const cjk = (plain.match(/[一-鿿぀-ヿ]/g) ?? []).length;
  const latin = plain
    .replace(/[一-鿿぀-ヿ]/g, " ")
    .split(/\s+/)
    .filter((word) => /[a-z0-9]/i.test(word)).length;
  return cjk + latin;
}

export function analyzeMarkdown(markdown: string, siteDomain?: string): MarkdownStats {
  const headings: { level: number; text: string }[] = [];
  const headingPattern = /^(#{1,6})\s+(.*)$/gm;
  let match: RegExpExecArray | null;
  while ((match = headingPattern.exec(markdown)) !== null) {
    headings.push({ level: match[1].length, text: match[2].trim() });
  }

  // Longest stretch of prose without a heading — the readability signal that
  // matters more than the raw heading count.
  const chunks = markdown.split(/^#{1,6}\s+.*$/m);
  const longestSectionWords = chunks.reduce(
    (max, chunk) => Math.max(max, countWords(chunk)),
    0,
  );

  let internalLinks = 0;
  let externalLinks = 0;
  const linkPattern = /\[[^\]]*\]\(([^)\s]+)/g;
  while ((match = linkPattern.exec(markdown)) !== null) {
    const href = match[1];
    if (href.startsWith("#")) continue;
    const isAbsolute = /^https?:\/\//i.test(href);
    if (!isAbsolute || (siteDomain && href.includes(siteDomain))) internalLinks++;
    else externalLinks++;
  }

  const images = [...markdown.matchAll(/!\[([^\]]*)\]\([^)]*\)/g)];

  return {
    wordCount: countWords(markdown),
    headings,
    longestSectionWords,
    internalLinks,
    externalLinks,
    imagePlaceholders: markdown.match(PLACEHOLDER_PATTERN) ?? [],
    imagesWithAlt: images.filter((image) => image[1].trim().length > 0).length,
    imagesWithoutAlt: images.filter((image) => image[1].trim().length === 0).length,
    hasFaq: /^#{2,3}\s*(faq|frequently asked)/im.test(markdown),
  };
}

export function keywordDensity(markdown: string, keyword: string): number {
  if (!keyword.trim()) return 0;
  const plain = toPlainText(markdown).toLowerCase();
  const total = countWords(markdown);
  if (total === 0) return 0;

  const needle = keyword.toLowerCase().trim();
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const occurrences = (plain.match(new RegExp(escaped, "g")) ?? []).length;
  // Density is measured against the phrase's own length, so a three-word
  // keyword isn't penalised for occupying three word slots.
  const keywordWords = Math.max(1, countWords(needle));
  return (occurrences * keywordWords) / total;
}

export type MechanicalIssue = {
  severity: "blocker" | "warning";
  message: string;
};

export type CheckInput = {
  bodyMd: string;
  metaTitle: string;
  metaDesc: string;
  slug: string;
  targetKeyword: string;
  forbidden: string[];
  wordCountRange: [number, number];
  siteDomain?: string;
  /** Titles already published on this site, for near-duplicate detection. */
  existingTitles?: string[];
  title?: string;
};

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿 ]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2)
      // Naive plural stripping. Without it "wearables" and "wearable" count as
      // unrelated tokens and a genuine near-duplicate scores below threshold.
      .map((token) =>
        token.length > 3 && token.endsWith("s") && !token.endsWith("ss")
          ? token.slice(0, -1)
          : token,
      ),
  );
}

/** Jaccard overlap. Cheap stand-in for the spec's embedding-cosine check. */
export function titleSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared++;
  return shared / (setA.size + setB.size - shared);
}

/**
 * Finds a forbidden term, allowing short inflections but not mid-word hits.
 *
 * A plain substring test is wrong in both directions: banning "cheap" would
 * miss nothing but banning "ai" would flag "said", "rain" and "detail". The
 * bounded suffix catches cheap/cheaper/cheapest while still requiring the term
 * to start on a word boundary. CJK has no word boundaries, so it falls back to
 * a substring test.
 */
export function findForbiddenTerm(text: string, term: string): string | null {
  const needle = term.trim();
  if (!needle) return null;

  if (/[一-鿿぀-ヿ]/.test(needle)) {
    return text.toLowerCase().includes(needle.toLowerCase()) ? needle : null;
  }

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escaped}\\w{0,3}\\b`, "i").exec(text);
  return match ? match[0] : null;
}

export function runMechanicalChecks(input: CheckInput): MechanicalIssue[] {
  const issues: MechanicalIssue[] = [];
  const stats = analyzeMarkdown(input.bodyMd, input.siteDomain);

  // ---- forbidden terms: a brand constraint, so always a blocker ----
  for (const term of input.forbidden) {
    const hit = findForbiddenTerm(input.bodyMd, term);
    if (hit) {
      issues.push({
        severity: "blocker",
        message:
          hit.toLowerCase() === term.trim().toLowerCase()
            ? `Uses forbidden term "${term}".`
            : `Uses "${hit}", a form of the forbidden term "${term}".`,
      });
    }
  }

  // ---- meta ----
  if (!input.metaTitle) {
    issues.push({ severity: "blocker", message: "Meta title is missing." });
  } else if (input.metaTitle.length > META_TITLE_MAX) {
    issues.push({
      severity: "warning",
      message: `Meta title is ${input.metaTitle.length} characters; it will truncate past ${META_TITLE_MAX}.`,
    });
  }

  if (!input.metaDesc) {
    issues.push({ severity: "blocker", message: "Meta description is missing." });
  } else if (input.metaDesc.length > META_DESC_MAX) {
    issues.push({
      severity: "warning",
      message: `Meta description is ${input.metaDesc.length} characters; it will truncate past ${META_DESC_MAX}.`,
    });
  } else if (input.metaDesc.length < META_DESC_MIN) {
    issues.push({
      severity: "warning",
      message: `Meta description is only ${input.metaDesc.length} characters — there is room for more.`,
    });
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) {
    issues.push({
      severity: "blocker",
      message: `Slug "${input.slug}" is not lowercase-hyphenated.`,
    });
  }

  // ---- body ----
  const [minWords, maxWords] = input.wordCountRange;
  if (stats.wordCount < minWords * 0.8) {
    issues.push({
      severity: "warning",
      message: `${stats.wordCount} words, short of the ${minWords}-${maxWords} target.`,
    });
  } else if (stats.wordCount > maxWords * 1.25) {
    issues.push({
      severity: "warning",
      message: `${stats.wordCount} words, well past the ${minWords}-${maxWords} target.`,
    });
  }

  const density = keywordDensity(input.bodyMd, input.targetKeyword);
  if (input.targetKeyword) {
    if (density < KEYWORD_DENSITY_MIN) {
      issues.push({
        severity: "warning",
        message: `Target keyword appears at ${(density * 100).toFixed(2)}% density — barely present.`,
      });
    } else if (density > KEYWORD_DENSITY_MAX) {
      issues.push({
        severity: "warning",
        message: `Target keyword at ${(density * 100).toFixed(2)}% density reads as stuffed.`,
      });
    }
  }

  if (stats.longestSectionWords > WORDS_PER_HEADING_MAX) {
    issues.push({
      severity: "warning",
      message: `${stats.longestSectionWords} words run without a heading.`,
    });
  }

  if (stats.headings.some((heading) => heading.level === 1)) {
    issues.push({
      severity: "warning",
      message: "Body contains an H1; the page template already renders the title.",
    });
  }

  if (stats.internalLinks < 2) {
    issues.push({
      severity: "warning",
      message: `Only ${stats.internalLinks} internal link(s); 2-4 is the target.`,
    });
  }

  if (stats.imagesWithoutAlt > 0) {
    issues.push({
      severity: "warning",
      message: `${stats.imagesWithoutAlt} image(s) have no alt text.`,
    });
  }

  // ---- duplication ----
  if (input.title && input.existingTitles?.length) {
    for (const existing of input.existingTitles) {
      const similarity = titleSimilarity(input.title, existing);
      if (similarity > 0.6) {
        issues.push({
          severity: "blocker",
          message: `Title overlaps ${(similarity * 100).toFixed(0)}% with existing article "${existing}".`,
        });
        break;
      }
    }
  }

  return issues;
}
