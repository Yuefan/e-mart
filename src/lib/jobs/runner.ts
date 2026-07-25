import type { JobRun } from "@prisma/client";
import type { TopicIdea } from "@/lib/ai/schemas";
import { runContentGenerate, runTopicIdeation } from "./content";
import { runGscSync } from "./gsc-sync";
import { runHealthCheck, runTokenRefresh } from "./maintenance";
import { parsePayload } from "./queue";
import { runSeoAudit } from "./seo-audit";

/** Dispatches a claimed job to its handler. Throwing marks the job failed. */
export async function runJob(job: JobRun): Promise<unknown> {
  switch (job.type) {
    case "gsc_sync": {
      if (!job.siteId) throw new Error("gsc_sync requires a siteId");
      const payload = parsePayload<{ days?: number }>(job);
      return runGscSync(job.siteId, { days: payload?.days ?? 7 });
    }

    case "seo_audit": {
      if (!job.siteId) throw new Error("seo_audit requires a siteId");
      const payload = parsePayload<{ triggeredBy?: "cron" | "manual" }>(job);
      return runSeoAudit(job.siteId, { triggeredBy: payload?.triggeredBy ?? "cron" });
    }

    case "content_ideate": {
      if (!job.siteId) throw new Error("content_ideate requires a siteId");
      const payload = parsePayload<{ count?: number }>(job);
      return runTopicIdeation(job.siteId, { count: payload?.count, jobId: job.id });
    }

    case "content_generate": {
      if (!job.siteId) throw new Error("content_generate requires a siteId");
      const payload = parsePayload<{ topic?: TopicIdea }>(job);
      if (!payload?.topic) throw new Error("content_generate requires a topic in its payload");
      return runContentGenerate(job.siteId, { topic: payload.topic, jobId: job.id });
    }

    case "token_refresh":
      return runTokenRefresh();

    case "health_check":
      return runHealthCheck();

    default:
      throw new Error(`No handler registered for job type "${job.type}"`);
  }
}
