import type { JobRun } from "@prisma/client";
import type { TopicIdea } from "@/lib/ai/schemas";
import { sendAuditReport } from "@/lib/email/audit-report";
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
      const result = await runSeoAudit(job.siteId, {
        triggeredBy: payload?.triggeredBy ?? "cron",
      });

      // Reporting is deliberately outside runSeoAudit and cannot throw: the
      // audit is already written by this point, and a mail problem must not
      // mark a completed run as failed.
      const report = await sendAuditReport(result.auditId);
      console.log(
        report.sent
          ? `[seo-audit] report emailed to ${report.to} (${report.messageId})`
          : `[seo-audit] no report sent: ${report.reason}`,
      );

      return { ...result, reportSent: report.sent };
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
