"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type JobSnapshot = {
  id: string;
  type: string;
  status: "queued" | "running" | "done" | "failed";
  progress: number;
  error: string | null;
  logs: unknown;
  workerLikelyDown: boolean;
};

export type JobState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "polling"; job: JobSnapshot }
  | { kind: "done"; job: JobSnapshot }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 2_000;

/**
 * Starts a queued job and follows it to completion.
 *
 * Everything queued goes through /api/jobs/[jobId], which also reports when a
 * job has been sitting unclaimed — without that the UI would spin forever when
 * the worker isn't running, which is the single most likely local misstep.
 */
export function useJob(onDone?: (job: JobSnapshot) => void) {
  const [state, setState] = useState<JobState>({ kind: "idle" });
  const jobIdRef = useRef<string | null>(null);
  const onDoneRef = useRef(onDone);
  // Kept in a ref so a caller passing an inline arrow doesn't restart polling,
  // and written in an effect because refs must not be mutated during render.
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const poll = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;

    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) throw new Error(`Could not read job status (${res.status})`);
      const job = (await res.json()) as JobSnapshot;

      if (job.status === "done") {
        jobIdRef.current = null;
        setState({ kind: "done", job });
        onDoneRef.current?.(job);
        return;
      }
      if (job.status === "failed") {
        jobIdRef.current = null;
        setState({ kind: "error", message: job.error ?? "The job failed." });
        return;
      }
      setState({ kind: "polling", job });
    } catch (error) {
      jobIdRef.current = null;
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Lost track of the job",
      });
    }
  }, []);

  useEffect(() => {
    if (state.kind !== "polling" && state.kind !== "starting") return;
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [state.kind, poll]);

  const start = useCallback(
    async (url: string, body?: unknown) => {
      setState({ kind: "starting" });
      try {
        const res = await fetch(url, {
          method: "POST",
          ...(body === undefined
            ? {}
            : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error ?? `Request failed (${res.status})`);
        jobIdRef.current = payload.jobId;
        await poll();
      } catch (error) {
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Could not start the job",
        });
      }
    },
    [poll],
  );

  const reset = useCallback(() => {
    jobIdRef.current = null;
    setState({ kind: "idle" });
  }, []);

  const busy = state.kind === "starting" || state.kind === "polling";

  return { state, start, reset, busy };
}
