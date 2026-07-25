"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TopicIdea } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";
import { Badge, EmptyState, buttonClass } from "./ui";
import { type JobSnapshot, useJob } from "./use-job";

const INTENT_LABEL: Record<string, string> = {
  informational: "Informational",
  commercial: "Commercial",
  transactional: "Transactional",
  navigational: "Navigational",
};

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
        title="Content generation needs the AI gateway"
        description="Set AI_API_KEY in .env and restart the worker. Everything else in the dashboard works without it — see docs/ai-gateway-setup.md."
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
            ? "Reading your Search Console data…"
            : topics.length
              ? "Suggest different topics"
              : "Suggest topics"}
        </button>
        <p className="text-xs text-muted">
          Candidates come from queries you already rank for but rank badly — real demand, proven
          relevance.
        </p>
      </div>

      {waitingOnWorker ? (
        <p className="mt-3 text-xs text-neg">
          Still queued — nothing is draining the queue. Start the worker with{" "}
          <code className="font-mono">npm run worker</code>.
        </p>
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
                  <span className="tnum text-xs text-muted">value {topic.estValue}</span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Badge tone="accent">{topic.targetKeyword}</Badge>
                  <Badge>{INTENT_LABEL[topic.searchIntent] ?? topic.searchIntent}</Badge>
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
                      ? `Writing… ${generation.state.job.progress}%`
                      : "Queued…"
                    : "Write this one"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
