import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeMarkdown,
  countWords,
  findForbiddenTerm,
  keywordDensity,
  runMechanicalChecks,
  titleSimilarity,
} from "./checks";

describe("findForbiddenTerm", () => {
  it("catches the term itself", () => {
    assert.equal(findForbiddenTerm("This is cheap plastic", "cheap"), "cheap");
  });

  it("catches short inflections", () => {
    assert.equal(findForbiddenTerm("the cheapest option", "cheap"), "cheapest");
    assert.equal(findForbiddenTerm("a cheaper build", "cheap"), "cheaper");
  });

  it("does not match inside unrelated words", () => {
    // The regression that motivated word-boundary matching: a two-letter term
    // matched half the dictionary under a plain substring test.
    assert.equal(findForbiddenTerm("he said hello", "ai"), null);
    assert.equal(findForbiddenTerm("rain fell on the detail", "ai"), null);
    assert.equal(findForbiddenTerm("recheap is not a word", "cheap"), null);
  });

  it("handles multi-word phrases", () => {
    assert.equal(
      findForbiddenTerm("we offer guaranteed results today", "guaranteed results"),
      "guaranteed results",
    );
  });

  it("falls back to substring matching for CJK", () => {
    assert.equal(findForbiddenTerm("这是夸大宣传用语", "夸大宣传"), "夸大宣传");
    assert.equal(findForbiddenTerm("正常描述", "夸大宣传"), null);
  });

  it("is case insensitive", () => {
    assert.equal(findForbiddenTerm("CHEAP goods", "cheap"), "CHEAP");
  });
});

describe("countWords", () => {
  it("ignores markdown syntax", () => {
    assert.equal(countWords("# Heading\n\nOne two three."), 4);
  });

  it("does not count link URLs", () => {
    assert.equal(countWords("See [the guide](https://example.com/a/b/c)."), 3);
  });

  it("counts CJK characters individually", () => {
    assert.equal(countWords("你好世界"), 4);
  });

  it("skips fenced code blocks", () => {
    assert.equal(countWords("Text here\n\n```\nconst a = 1;\n```\n"), 2);
  });
});

describe("keywordDensity", () => {
  it("weights multi-word keywords by their own length", () => {
    // 4 occurrences x 2 words / 100 words = 8%
    const body = `${"posture sensor ".repeat(4)}${"filler ".repeat(92)}`;
    assert.equal(Math.round(keywordDensity(body, "posture sensor") * 100), 8);
  });

  it("returns zero without a keyword", () => {
    assert.equal(keywordDensity("some text", ""), 0);
  });
});

describe("analyzeMarkdown", () => {
  it("separates internal from external links", () => {
    const stats = analyzeMarkdown(
      "[a](https://example.com/x) [b](https://other.com/y) [c](/relative)",
      "example.com",
    );
    assert.equal(stats.internalLinks, 2);
    assert.equal(stats.externalLinks, 1);
  });

  it("finds the longest run without a heading", () => {
    const stats = analyzeMarkdown(`## A\n\n${"word ".repeat(50)}\n\n## B\n\n${"word ".repeat(10)}`);
    assert.equal(stats.longestSectionWords, 50);
  });

  it("counts image placeholders and missing alt text", () => {
    const stats = analyzeMarkdown("{{IMAGE_1}}\n\n![](a.png)\n\n![described](b.png)");
    assert.equal(stats.imagePlaceholders.length, 1);
    assert.equal(stats.imagesWithoutAlt, 1);
    assert.equal(stats.imagesWithAlt, 1);
  });
});

describe("titleSimilarity", () => {
  it("scores near-duplicates high", () => {
    assert.ok(
      titleSimilarity(
        "Choosing a posture sensor for wearables",
        "Choosing a posture sensor for wearable devices",
      ) > 0.6,
    );
  });

  it("scores unrelated titles low", () => {
    assert.ok(titleSimilarity("Posture sensor guide", "RTK positioning explained") < 0.2);
  });
});

describe("runMechanicalChecks", () => {
  // Five sections of ~260 words each: long enough to clear the word-count
  // floor, chunked so no single run trips the heading-cadence check.
  const wellFormedBody = [
    ...Array.from({ length: 5 }, (_, index) => `## Section ${index + 1}\n\n${"word ".repeat(260)}`),
    "[link](https://example.com/a) [link](https://example.com/b)",
  ].join("\n\n");

  const base = {
    bodyMd: wellFormedBody,
    metaTitle: "A reasonable meta title under sixty characters",
    metaDesc:
      "A meta description written to sit comfortably inside the seventy to one hundred fifty five character band that search results allow.",
    slug: "a-valid-slug",
    targetKeyword: "",
    forbidden: [],
    wordCountRange: [1200, 1800] as [number, number],
    siteDomain: "example.com",
  };

  it("passes a well-formed draft", () => {
    assert.deepEqual(runMechanicalChecks(base), []);
  });

  it("blocks an invalid slug", () => {
    const issues = runMechanicalChecks({ ...base, slug: "Not A Slug" });
    assert.ok(issues.some((i) => i.severity === "blocker" && /slug/i.test(i.message)));
  });

  it("blocks a near-duplicate title", () => {
    const issues = runMechanicalChecks({
      ...base,
      title: "Choosing a posture sensor for wearables",
      existingTitles: ["Choosing a posture sensor for wearable devices"],
    });
    assert.ok(issues.some((i) => i.severity === "blocker" && i.message.includes("overlaps")));
  });

  it("warns on a short draft", () => {
    const issues = runMechanicalChecks({ ...base, bodyMd: "## A\n\nshort" });
    assert.ok(issues.some((i) => i.message.includes("short of the")));
  });
});
