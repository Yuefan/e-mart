"use client";

import {
  KEYWORD_DENSITY_MAX,
  KEYWORD_DENSITY_MIN,
  META_DESC_MAX,
  META_DESC_MIN,
  META_TITLE_MAX,
  WORDS_PER_HEADING_MAX,
  analyzeMarkdown,
  keywordDensity,
} from "@/lib/content/checks";
import { fmt } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import { useT } from "./i18n-provider";

type Verdict = "good" | "warn" | "bad";

const TONE: Record<Verdict, string> = {
  good: "text-pos",
  warn: "text-accent",
  bad: "text-neg",
};

/** Icon plus label, so the verdict never rests on colour alone. */
const MARK: Record<Verdict, string> = { good: "●", warn: "▲", bad: "■" };

function Metric({
  label,
  value,
  verdict,
  detail,
}: {
  label: string;
  value: string;
  verdict: Verdict;
  detail: string;
}) {
  return (
    <div className="min-w-28" title={detail}>
      <p className="text-[11px] tracking-wide text-muted uppercase">{label}</p>
      <p className={cn("tnum mt-0.5 text-sm font-medium", TONE[verdict])}>
        <span aria-hidden className="mr-1 text-[10px]">
          {MARK[verdict]}
        </span>
        {value}
      </p>
      <span className="sr-only">{detail}</span>
    </div>
  );
}

export function SeoBar({
  bodyMd,
  metaTitle,
  metaDesc,
  targetKeyword,
  siteDomain,
  wordCountRange,
}: {
  bodyMd: string;
  metaTitle: string;
  metaDesc: string;
  targetKeyword: string;
  siteDomain: string;
  wordCountRange: [number, number];
}) {
  const t = useT();
  const b = t.content.seoBar;
  const stats = analyzeMarkdown(bodyMd, siteDomain);
  const density = keywordDensity(bodyMd, targetKeyword);
  const [minWords, maxWords] = wordCountRange;

  const wordVerdict: Verdict =
    stats.wordCount < minWords * 0.8 ? "bad" : stats.wordCount > maxWords * 1.25 ? "warn" : "good";

  const densityVerdict: Verdict = !targetKeyword
    ? "warn"
    : density < KEYWORD_DENSITY_MIN
      ? "bad"
      : density > KEYWORD_DENSITY_MAX
        ? "bad"
        : "good";

  const titleVerdict: Verdict =
    metaTitle.length === 0 ? "bad" : metaTitle.length > META_TITLE_MAX ? "warn" : "good";

  const descVerdict: Verdict =
    metaDesc.length === 0
      ? "bad"
      : metaDesc.length > META_DESC_MAX || metaDesc.length < META_DESC_MIN
        ? "warn"
        : "good";

  const sectionVerdict: Verdict =
    stats.longestSectionWords > WORDS_PER_HEADING_MAX ? "warn" : "good";

  const linkVerdict: Verdict = stats.internalLinks >= 2 ? "good" : "warn";

  const altVerdict: Verdict = stats.imagesWithoutAlt > 0 ? "warn" : "good";

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3 border-b border-line bg-panel-alt/50 px-5 py-3">
      <Metric
        label={b.words}
        value={String(stats.wordCount)}
        verdict={wordVerdict}
        detail={fmt(b.wordTarget, { min: minWords, max: maxWords })}
      />
      <Metric
        label={b.keyword}
        value={targetKeyword ? `${(density * 100).toFixed(2)}%` : "—"}
        verdict={densityVerdict}
        detail={
          targetKeyword
            ? fmt(b.densityOf, {
                kw: targetKeyword,
                min: (KEYWORD_DENSITY_MIN * 100).toFixed(1),
                max: (KEYWORD_DENSITY_MAX * 100).toFixed(1),
              })
            : b.noKeyword
        }
      />
      <Metric
        label={b.metaTitle}
        value={`${metaTitle.length}/${META_TITLE_MAX}`}
        verdict={titleVerdict}
        detail={fmt(b.titleTruncates, { max: META_TITLE_MAX })}
      />
      <Metric
        label={b.metaDesc}
        value={`${metaDesc.length}/${META_DESC_MAX}`}
        verdict={descVerdict}
        detail={fmt(b.descAim, { min: META_DESC_MIN, max: META_DESC_MAX })}
      />
      <Metric
        label={b.headings}
        value={String(stats.headings.length)}
        verdict={sectionVerdict}
        detail={fmt(b.longestRun, {
          words: stats.longestSectionWords,
          cap: WORDS_PER_HEADING_MAX,
        })}
      />
      <Metric
        label={b.internalLinks}
        value={String(stats.internalLinks)}
        verdict={linkVerdict}
        detail={b.linkTarget}
      />
      <Metric
        label={b.imageAlt}
        value={
          stats.imagesWithAlt + stats.imagesWithoutAlt === 0
            ? fmt(b.slots, { n: stats.imagePlaceholders.length })
            : `${stats.imagesWithAlt}/${stats.imagesWithAlt + stats.imagesWithoutAlt}`
        }
        verdict={altVerdict}
        detail={
          stats.imagePlaceholders.length > 0
            ? fmt(b.placeholders, { n: stats.imagePlaceholders.length })
            : b.altEvery
        }
      />
    </div>
  );
}
