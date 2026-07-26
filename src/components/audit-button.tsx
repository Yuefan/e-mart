"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { useT } from "./i18n-provider";
import { buttonClass } from "./ui";

type JobState = {
  status: string;
  progress: number;
  error: string | null;
  workerLikelyDown: boolean;
};

type UiState =
  | { kind: "idle" }
  | { kind: "running"; job: JobState | null }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 2_000;

export function AuditButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const t = useT();
  const [state, setState] = useState<UiState>({ kind: "idle" });
  const jobIdRef = useRef<string | null>(null);

  // Poll the queued job until it lands, then refresh the page data.
  const poll = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;

    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) throw new Error(`${t.seo.jobStatusFailed} (${res.status})`);
      const job = (await res.json()) as JobState;

      if (job.status === "done") {
        jobIdRef.current = null;
        setState({ kind: "idle" });
        router.refresh();
        return;
      }
      if (job.status === "failed") {
        jobIdRef.current = null;
        setState({ kind: "error", message: job.error ?? t.seo.auditFailed });
        router.refresh();
        return;
      }
      setState({ kind: "running", job });
    } catch (error) {
      jobIdRef.current = null;
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : t.seo.jobLost,
      });
    }
  }, [router, t]);

  useEffect(() => {
    if (state.kind !== "running") return;
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [state.kind, poll]);

  async function start() {
    setState({ kind: "running", job: null });
    try {
      const res = await fetch(`/api/sites/${siteId}/seo/audit`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error ?? `${t.seo.auditStartFailed} (${res.status})`);
      }
      jobIdRef.current = body.jobId;
      void poll();
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : t.seo.auditStartFailed,
      });
    }
  }

  const running = state.kind === "running";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button type="button" onClick={start} disabled={running} className={buttonClass("primary")}>
        {running
          ? state.job?.status === "running"
            ? fmt(t.seo.auditing, { pct: state.job.progress })
            : t.common.queued
          : t.seo.runAudit}
      </button>

      {running && state.job?.workerLikelyDown ? (
        <p className="max-w-xs text-right text-xs text-neg">{t.common.workerHint}</p>
      ) : null}

      {state.kind === "error" ? (
        <p className="max-w-xs text-right text-xs text-neg">{state.message}</p>
      ) : null}
    </div>
  );
}
