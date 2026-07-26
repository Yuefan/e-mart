"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TopicIdea } from "@/lib/ai/schemas";
import { fmt } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import { useT } from "./i18n-provider";
import { Badge, EmptyState, buttonClass } from "./ui";
import { type JobSnapshot, useJob } from "./use-job";

function topicsFromLogs(logs: unknown): TopicIdea[] {
  if (typeof logs !== "object" || logs === null) return [];
  const topics = (logs as { topics?: unknown }).topics;
  return Array.isArray(topics) ? (topics as TopicIdea[]) : [];
}

export function TopicPicker({
  siteId,
  aiConfigured,
}: {
  siteId: string;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const [topics, setTopics] = useState<TopicIdea[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);

  const ideation = useJob((job: JobSnapshot) => setTopics(topicsFromLogs(job.logs)));
  const generation = useJob((job: JobSnapshot) => {
    const articleId = (job.logs as { articleId?: string } | null)?.articleId;
    setGenerating(null);
    if (articleId) router.push(`/sites/${siteId}/content/${articleId}`);
    else router.refresh();
  });

  if (!aiConfigured) {
    return (
      <EmptyState
        title={t.content.aiRequired}
        description={t.content.aiRequiredHint}
      />
    );
  }

  const busy = ideation.busy || generation.busy;
  const error =
    ideation.state.kind === "error"
      ? ideation.state.message
      : generation.state.kind === "error"
        ? generation.state.message
        : null;

  const waitingOnWorker =
    (ideation.state.kind === "polling" && ideation.state.job.workerLikelyDown) ||
    (generation.state.kind === "polling" && generation.state.job.workerLikelyDown);

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void ideation.start(`/api/sites/${siteId}/content/ideate`)}
          className={buttonClass("primary")}
        >
          {ideation.busy
            ? t.content.readingGsc
            : topics.length
              ? t.content.suggestDifferent
              : t.content.suggestTopics}
        </button>
        <p className="text-xs text-muted">{t.content.topicSourceHint}</p>
      </div>

      {waitingOnWorker ? (
        <p className="mt-3 text-xs text-neg">{t.common.workerHint}</p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-neg">{error}</p> : null}

      {topics.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {topics.map((topic) => {
            const isGenerating = generating === topic.title;
            return (
              <li
                key={topic.title}
                className={cn(
                  "rounded-lg border border-line px-4 py-3 transition-colors",
                  isGenerating && "bg-panel-alt",
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{topic.title}</p>
                  <span className="tnum text-xs text-muted">
                    {fmt(t.content.value, { n: topic.estValue })}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Badge tone="accent">{topic.targetKeyword}</Badge>
                  <Badge>
                    {t.content.intents[
                      topic.searchIntent as keyof typeof t.content.intents
                    ] ?? topic.searchIntent}
                  </Badge>
                </div>

                <p className="mt-2 text-sm text-muted">{topic.angle}</p>
                <p className="mt-1 text-xs text-muted">{topic.rationale}</p>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setGenerating(topic.title);
                    void generation.start(`/api/sites/${siteId}/content/generate`, { topic });
                  }}
                  className={buttonClass("secondary", "mt-3")}
                >
                  {isGenerating
                    ? generation.state.kind === "polling"
                      ? fmt(t.content.writing, { pct: generation.state.job.progress })
                      : t.common.queued
                    : t.content.writeThisOne}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
