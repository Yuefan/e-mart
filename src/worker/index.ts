/**
 * Standing worker process: `npm run worker`.
 *
 * Two loops share one process — a fast one that drains queued jobs and a slow
 * one that enqueues repeatable work. Keeping them here rather than in the web
 * process is the point of the split in spec §2.2: an SEO audit or a content
 * generation run takes minutes, which must never sit inside an HTTP request.
 */
import "@/lib/load-env"; // must precede any import that reads process.env
import { claimNext, completeJob, failJob, reclaimStale, workerId } from "@/lib/jobs/queue";
import { runJob } from "@/lib/jobs/runner";
import { tick } from "@/lib/jobs/schedule";
import { prisma } from "@/lib/prisma";

const JOB_POLL_MS = 2_000;
const SCHEDULER_INTERVAL_MS = 60_000;
const STALE_SWEEP_INTERVAL_MS = 5 * 60_000;

let shuttingDown = false;
/** Set while a job is mid-flight so shutdown can wait for it to land. */
let activeJob: Promise<void> | null = null;

function log(message: string, extra?: unknown) {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  if (extra === undefined) console.log(`[${stamp}] ${message}`);
  else console.log(`[${stamp}] ${message}`, extra);
}

async function drainOnce(): Promise<boolean> {
  const job = await claimNext();
  if (!job) return false;

  const label = `${job.type}${job.siteId ? ` site=${job.siteId}` : ""} (attempt ${job.attempts})`;
  log(`▶ ${label}`);
  const started = Date.now();

  try {
    const result = await runJob(job);
    await completeJob(job.id, result);
    log(`✔ ${label} in ${Date.now() - started}ms`, result);
  } catch (error) {
    await failJob(job.id, error);
    log(`✘ ${label} failed after ${Date.now() - started}ms`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return true;
}

async function jobLoop() {
  while (!shuttingDown) {
    try {
      // Track the in-flight job so SIGINT can wait rather than sever it.
      activeJob = drainOnce().then((worked) => {
        if (!worked) return sleep(JOB_POLL_MS);
      });
      await activeJob;
      activeJob = null;
    } catch (error) {
      log("job loop error", error);
      await sleep(JOB_POLL_MS);
    }
  }
}

async function schedulerLoop() {
  while (!shuttingDown) {
    try {
      const { enqueued } = await tick();
      if (enqueued.length) log(`scheduled ${enqueued.length} job(s)`, enqueued);
    } catch (error) {
      log("scheduler error", error);
    }
    await sleep(SCHEDULER_INTERVAL_MS);
  }
}

async function staleSweepLoop() {
  while (!shuttingDown) {
    try {
      const reclaimed = await reclaimStale();
      if (reclaimed) log(`reclaimed ${reclaimed} stale job(s)`);
    } catch (error) {
      log("stale sweep error", error);
    }
    await sleep(STALE_SWEEP_INTERVAL_MS);
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`${signal} received — finishing current job then exiting`);

  // Give the running job a bounded chance to finish; a half-written sync is
  // recoverable (the window is rewritten next run) but noisy.
  await Promise.race([activeJob ?? Promise.resolve(), sleep(20_000)]);
  await prisma.$disconnect();
  log("worker stopped");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// Wrapped rather than top-level await: tsx compiles this file as CJS.
async function main() {
  log(`worker starting (${workerId})`);
  if (process.env.NODE_USE_ENV_PROXY !== "1" && process.env.HTTPS_PROXY) {
    log(
      "WARNING: HTTPS_PROXY is set but NODE_USE_ENV_PROXY is not — outbound calls " +
        "will bypass the proxy and time out. Start with `npm run worker`.",
    );
  }
  await Promise.all([jobLoop(), schedulerLoop(), staleSweepLoop()]);
}

void main();
