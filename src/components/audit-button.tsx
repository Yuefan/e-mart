"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [state, setState] = useState<UiState>({ kind: "idle" });
  const jobIdRef = useRef<string | null>(null);

  // Poll the queued job until it lands, then refresh the page data.
  const poll = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;

    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) throw new Error(`Could not read job status (${res.status})`);
      const job = (await res.json()) as JobState;

      if (job.status === "done") {
        jobIdRef.current = null;
        setState({ kind: "idle" });
        router.refresh();
        return;
      }
      if (job.status === "failed") {
        jobIdRef.current = null;
        setState({ kind: "error", message: job.error ?? "The audit failed." });
        router.refresh();
        return;
      }
      setState({ kind: "running", job });
    } catch (error) {
      jobIdRef.current = null;
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Lost track of the audit job",
      });
    }
  }, [router]);

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
      if (!res.ok) throw new Error(body?.error ?? `Could not start the audit (${res.status})`);
      jobIdRef.current = body.jobId;
      void poll();
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not start the audit",
      });
    }
  }

  const running = state.kind === "running";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button type="button" onClick={start} disabled={running} className={buttonClass("primary")}>
        {running
          ? state.job?.status === "running"
            ? `Auditing… ${state.job.progress}%`
            : "Queued…"
          : "Run audit"}
      </button>

      {running && state.job?.workerLikelyDown ? (
        <p className="max-w-xs text-right text-xs text-neg">
          Still queued — nothing is draining the queue. Start the worker with{" "}
          <code className="font-mono">npm run worker</code>.
        </p>
      ) : null}

      {state.kind === "error" ? (
        <p className="max-w-xs text-right text-xs text-neg">{state.message}</p>
      ) : null}
    </div>
  );
}
