"use client";

import DOMPurify from "dompurify";
import { marked } from "marked";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { MechanicalIssue } from "@/lib/content/checks";
import { cn } from "@/lib/utils";
import { SeoBar } from "./seo-bar";
import { Badge, Card, CardHeader, buttonClass, inputClass } from "./ui";

export type EditableArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  bodyMd: string;
  metaTitle: string;
  metaDesc: string;
  targetKeyword: string;
  status: string;
};

const STATUSES = ["draft", "review", "scheduled", "published"] as const;

type SaveState =
  | { kind: "clean" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export function ArticleEditor({
  article,
  siteId,
  siteDomain,
  wordCountRange,
  initialIssues,
}: {
  article: EditableArticle;
  siteId: string;
  siteDomain: string;
  wordCountRange: [number, number];
  initialIssues: MechanicalIssue[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<EditableArticle>(article);
  const [issues, setIssues] = useState<MechanicalIssue[]>(initialIssues);
  const [save, setSave] = useState<SaveState>({ kind: "clean" });
  const [showPreview, setShowPreview] = useState(true);

  // DOMPurify needs a real DOM, which the server render of this client
  // component does not have. useSyncExternalStore gives a hydration-safe
  // "are we on the client yet" flag, so the preview is derived during render
  // rather than pushed in from an effect.
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const preview = useMemo(() => {
    if (!isClient) return "";
    const html = marked.parse(draft.bodyMd, { async: false }) as string;
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  }, [draft.bodyMd, isClient]);

  function update<K extends keyof EditableArticle>(key: K, value: EditableArticle[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSave({ kind: "dirty" });
  }

  async function persist(overrides: Partial<EditableArticle> = {}) {
    const next = { ...draft, ...overrides };
    setSave({ kind: "saving" });
    try {
      const res = await fetch(`/api/articles/${article.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: next.title,
          slug: next.slug,
          excerpt: next.excerpt,
          bodyMd: next.bodyMd,
          metaTitle: next.metaTitle,
          metaDesc: next.metaDesc,
          targetKeyword: next.targetKeyword,
          status: next.status,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Save failed (${res.status})`);

      setDraft(next);
      setIssues(body.issues ?? []);
      setSave({ kind: "saved" });
      router.refresh();
    } catch (error) {
      setSave({
        kind: "error",
        message: error instanceof Error ? error.message : "Save failed",
      });
    }
  }

  async function remove() {
    setSave({ kind: "saving" });
    try {
      const res = await fetch(`/api/articles/${article.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      router.push(`/sites/${siteId}/content`);
      router.refresh();
    } catch (error) {
      setSave({
        kind: "error",
        message: error instanceof Error ? error.message : "Delete failed",
      });
    }
  }

  const blockers = issues.filter((issue) => issue.severity === "blocker");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            <label htmlFor="status" className="text-xs text-muted">
              Status
            </label>
            <select
              id="status"
              value={draft.status}
              onChange={(event) => {
                update("status", event.target.value);
                void persist({ status: event.target.value });
              }}
              className={inputClass("w-auto py-1.5 text-xs capitalize")}
            >
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            {blockers.length > 0 ? (
              <Badge tone="negative">
                {blockers.length} blocker{blockers.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <span
              className={cn(
                "text-xs",
                save.kind === "error" ? "text-neg" : "text-muted",
              )}
            >
              {save.kind === "saving"
                ? "Saving…"
                : save.kind === "saved"
                  ? "Saved"
                  : save.kind === "dirty"
                    ? "Unsaved changes"
                    : save.kind === "error"
                      ? save.message
                      : ""}
            </span>
            <button
              type="button"
              onClick={() => setShowPreview((value) => !value)}
              className={buttonClass("ghost", "text-xs")}
            >
              {showPreview ? "Hide preview" : "Show preview"}
            </button>
            <button
              type="button"
              onClick={() => void persist()}
              disabled={save.kind === "saving"}
              className={buttonClass("primary")}
            >
              Save
            </button>
          </div>
        </div>

        <SeoBar
          bodyMd={draft.bodyMd}
          metaTitle={draft.metaTitle}
          metaDesc={draft.metaDesc}
          targetKeyword={draft.targetKeyword}
          siteDomain={siteDomain}
          wordCountRange={wordCountRange}
        />

        <div className={cn("grid gap-0", showPreview && "lg:grid-cols-2")}>
          <div className="border-line lg:border-r">
            <textarea
              value={draft.bodyMd}
              onChange={(event) => update("bodyMd", event.target.value)}
              spellCheck
              className="h-[32rem] w-full resize-y bg-transparent px-5 py-4 font-mono text-sm leading-relaxed focus-visible:outline-none"
            />
          </div>
          {showPreview ? (
            <div className="h-[32rem] overflow-y-auto px-5 py-4">
              <h1 className="text-xl font-semibold">{draft.title}</h1>
              <div
                className="prose-preview mt-4 text-sm"
                // Markdown is rendered then sanitised with DOMPurify above.
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            </div>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="Metadata" />
          <div className="space-y-3 px-5 py-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium">
                Title
              </label>
              <input
                id="title"
                value={draft.title}
                onChange={(event) => update("title", event.target.value)}
                className={inputClass("mt-1.5")}
              />
            </div>
            <div>
              <label htmlFor="slug" className="block text-sm font-medium">
                Slug
              </label>
              <input
                id="slug"
                value={draft.slug}
                onChange={(event) => update("slug", event.target.value)}
                className={inputClass("mt-1.5 font-mono text-xs")}
              />
            </div>
            <div>
              <label htmlFor="keyword" className="block text-sm font-medium">
                Target keyword
              </label>
              <input
                id="keyword"
                value={draft.targetKeyword}
                onChange={(event) => update("targetKeyword", event.target.value)}
                className={inputClass("mt-1.5")}
              />
            </div>
            <div>
              <label htmlFor="metaTitle" className="block text-sm font-medium">
                Meta title
              </label>
              <input
                id="metaTitle"
                value={draft.metaTitle}
                onChange={(event) => update("metaTitle", event.target.value)}
                className={inputClass("mt-1.5")}
              />
            </div>
            <div>
              <label htmlFor="metaDesc" className="block text-sm font-medium">
                Meta description
              </label>
              <textarea
                id="metaDesc"
                rows={3}
                value={draft.metaDesc}
                onChange={(event) => update("metaDesc", event.target.value)}
                className={inputClass("mt-1.5 resize-y")}
              />
            </div>
            <div>
              <label htmlFor="excerpt" className="block text-sm font-medium">
                Excerpt
              </label>
              <textarea
                id="excerpt"
                rows={2}
                value={draft.excerpt}
                onChange={(event) => update("excerpt", event.target.value)}
                className={inputClass("mt-1.5 resize-y")}
              />
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader
              title="Checks"
              hint={
                issues.length === 0
                  ? "Nothing flagged."
                  : `${blockers.length} blocker(s), ${warnings.length} warning(s)`
              }
            />
            {issues.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">
                All mechanical checks pass.
              </p>
            ) : (
              <ul className="divide-y divide-line/60">
                {[...blockers, ...warnings].map((issue, index) => (
                  <li key={`${issue.severity}-${index}`} className="flex gap-2.5 px-5 py-2.5">
                    <span
                      className={cn(
                        "mt-0.5 text-[10px]",
                        issue.severity === "blocker" ? "text-neg" : "text-accent",
                      )}
                      aria-hidden
                    >
                      {issue.severity === "blocker" ? "■" : "▲"}
                    </span>
                    <p className="text-sm">
                      <span className="sr-only">{issue.severity}: </span>
                      {issue.message}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Publish"
              hint="Targets unlock once Shopify or GitHub is connected."
            />
            <div className="px-5 py-4">
              <p className="text-sm text-muted">
                Nothing to publish to yet. Connect a destination from the Connections page and
                the draft can be pushed from here.
              </p>
              <button
                type="button"
                onClick={() => void remove()}
                className={buttonClass("ghost", "mt-3 -ml-2 text-xs text-neg")}
              >
                Delete draft
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
