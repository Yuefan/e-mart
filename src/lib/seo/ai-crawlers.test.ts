import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blockedAiCrawlers, withdrawnSchemaTypes } from "./ai-crawlers";

describe("blockedAiCrawlers", () => {
  it("reports nothing when there is no robots.txt", () => {
    assert.deepEqual(blockedAiCrawlers(null), { blocked: [], viaWildcard: false });
  });

  it("reports nothing for a permissive file", () => {
    const { blocked } = blockedAiCrawlers("User-agent: *\nDisallow:\n");
    assert.deepEqual(blocked, []);
  });

  it("catches a crawler named explicitly", () => {
    const { blocked, viaWildcard } = blockedAiCrawlers(
      "User-agent: GPTBot\nDisallow: /\n",
    );
    assert.deepEqual(blocked, ["GPTBot"]);
    assert.equal(viaWildcard, false);
  });

  it("catches every crawler when the wildcard blocks the site", () => {
    const { blocked, viaWildcard } = blockedAiCrawlers("User-agent: *\nDisallow: /\n");
    assert.equal(blocked.length, 5);
    assert.equal(viaWildcard, true);
  });

  it("lets a named allow-group override a blocking wildcard", () => {
    // The case that matters in practice: block everything by default, then let
    // one crawler back in. Reading the wildcard alone would report GPTBot as
    // blocked when it is the one crawler explicitly permitted.
    const { blocked } = blockedAiCrawlers(
      "User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nDisallow:\n",
    );
    assert.ok(!blocked.includes("GPTBot"));
    assert.ok(blocked.includes("ClaudeBot"));
  });

  it("ignores training-only crawlers", () => {
    // Opting out of model training is a deliberate, reasonable choice and says
    // nothing about AI search visibility.
    const { blocked } = blockedAiCrawlers(
      "User-agent: Google-Extended\nDisallow: /\nUser-agent: CCBot\nDisallow: /\n",
    );
    assert.deepEqual(blocked, []);
  });

  it("treats consecutive user-agent lines as one group", () => {
    const { blocked } = blockedAiCrawlers(
      "User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n",
    );
    assert.deepEqual(blocked.sort(), ["ClaudeBot", "GPTBot"]);
  });

  it("is case-insensitive and ignores comments", () => {
    const { blocked } = blockedAiCrawlers(
      "# keep the bots out\nuser-agent: gptbot\ndisallow: /   # everything\n",
    );
    assert.deepEqual(blocked, ["GPTBot"]);
  });

  it("does not treat a path-scoped disallow as a site-wide block", () => {
    const { blocked } = blockedAiCrawlers("User-agent: GPTBot\nDisallow: /admin\n");
    assert.deepEqual(blocked, []);
  });
});

describe("withdrawnSchemaTypes", () => {
  it("flags a withdrawn type with its date", () => {
    const found = withdrawnSchemaTypes(["Article", "HowTo"]);
    assert.equal(found.length, 1);
    assert.equal(found[0].type, "HowTo");
    assert.match(found[0].note, /September 2023/);
  });

  it("leaves current types alone", () => {
    assert.deepEqual(withdrawnSchemaTypes(["Organization", "Product", "FAQPage"]), []);
  });

  it("matches regardless of case and does not repeat a type", () => {
    const found = withdrawnSchemaTypes(["howto", "HowTo", "HOWTO"]);
    assert.equal(found.length, 1);
  });
});
