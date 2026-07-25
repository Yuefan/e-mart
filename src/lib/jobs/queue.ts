import { hostname } from "node:os";
import type { JobRun } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * A job queue backed by the JobRun table.
 *
 * The spec calls for BullMQ, which needs Redis; this machine has neither Redis
 * nor Docker. A single-consumer polling queue over SQLite covers the same
 * contract — durable jobs, idempotent scheduling, retries with backoff — and
 * keeps the deployment to one process plus one file. Swapping in BullMQ later
 * means reimplementing this module and nothing else: callers only ever see
 * `enqueue` and the worker only ever sees `claimNext`.
 */

export type JobType =
  | "gsc_sync"
  | "seo_audit"
  | "token_refresh"
  | "health_check"
  | "content_ideate"
  | "content_generate";

export const MAX_ATTEMPTS = 3;
/** A job still "running" after this long is assumed to be from a dead worker. */
export const STALE_AFTER_MS = 15 * 60 * 1000;

export const workerId = `${hostname()}:${process.pid}`;

export type EnqueueOptions = {
  type: JobType;
  siteId?: string | null;
  payload?: unknown;
  /**
   * Idempotency handle. A unique index means a second enqueue with the same key
   * is a no-op, which is how repeatable jobs avoid double-running.
   */
  dedupeKey?: string;
  runAfter?: Date;
};

export async function enqueue(options: EnqueueOptions): Promise<JobRun | null> {
  const data = {
    type: options.type,
    siteId: options.siteId ?? null,
    payload: options.payload === undefined ? null : JSON.stringify(options.payload),
    dedupeKey: options.dedupeKey ?? null,
    runAfter: options.runAfter ?? new Date(),
    status: "queued",
  };

  if (!options.dedupeKey) return prisma.jobRun.create({ data });

  // Check first so the common "already scheduled" path doesn't emit a Prisma
  // error log on every scheduler tick. The unique index is still the backstop.
  const existing = await prisma.jobRun.findUnique({
    where: { dedupeKey: options.dedupeKey },
    select: { id: true },
  });
  if (existing) return null;

  try {
    return await prisma.jobRun.create({ data });
  } catch (error) {
    // Lost a race with another worker — the period is scheduled either way.
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Atomically take one runnable job. The conditional updateMany is the lock:
 * only the worker whose update reports a row actually claimed it, so this stays
 * correct if a second worker is ever started.
 */
export async function claimNext(): Promise<JobRun | null> {
  const candidates = await prisma.jobRun.findMany({
    where: { status: "queued", runAfter: { lte: new Date() } },
    orderBy: { runAfter: "asc" },
    take: 5,
    select: { id: true },
  });

  for (const candidate of candidates) {
    const claimed = await prisma.jobRun.updateMany({
      where: { id: candidate.id, status: "queued" },
      data: {
        status: "running",
        claimedAt: new Date(),
        attempts: { increment: 1 },
        logs: JSON.stringify({ workerId }),
      },
    });
    if (claimed.count === 1) return prisma.jobRun.findUnique({ where: { id: candidate.id } });
  }

  return null;
}

export async function completeJob(jobId: string, logs?: unknown): Promise<void> {
  await prisma.jobRun.update({
    where: { id: jobId },
    data: {
      status: "done",
      progress: 100,
      finishedAt: new Date(),
      error: null,
      ...(logs === undefined ? {} : { logs: JSON.stringify(logs) }),
    },
  });
}

/** Fails a job, scheduling a backed-off retry while attempts remain. */
export async function failJob(jobId: string, error: unknown): Promise<void> {
  const job = await prisma.jobRun.findUnique({ where: { id: jobId } });
  if (!job) return;

  const message = error instanceof Error ? error.message : String(error);
  const exhausted = job.attempts >= MAX_ATTEMPTS;

  await prisma.jobRun.update({
    where: { id: jobId },
    data: exhausted
      ? { status: "failed", error: message, finishedAt: new Date() }
      : {
          status: "queued",
          error: message,
          // 1min, 4min, 9min — slow enough to outlast a brief network blip.
          runAfter: new Date(Date.now() + job.attempts ** 2 * 60_000),
        },
  });
}

export async function updateProgress(jobId: string, progress: number): Promise<void> {
  await prisma.jobRun.update({
    where: { id: jobId },
    data: { progress: Math.max(0, Math.min(100, Math.round(progress))) },
  });
}

/** Requeue jobs abandoned by a worker that died mid-run. */
export async function reclaimStale(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const { count } = await prisma.jobRun.updateMany({
    where: { status: "running", claimedAt: { lt: cutoff } },
    data: { status: "queued", claimedAt: null, error: "reclaimed after worker timeout" },
  });
  return count;
}

export function parsePayload<T>(job: JobRun): T | null {
  if (!job.payload) return null;
  try {
    return JSON.parse(job.payload) as T;
  } catch {
    return null;
  }
}
