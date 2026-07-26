import { appUrl } from "@/lib/env";
import type { Locale } from "@/lib/i18n/config";
import { isLocale } from "@/lib/i18n/config";
import { numberField } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured, sendEmail } from "./send";
import { auditReportEmail } from "./templates";

/** Worst first — the email shows only the first few. */
const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;
const MAX_FINDINGS_IN_EMAIL = 5;

/**
 * Emails the owner the result of a finished audit.
 *
 * Never throws. A mail failure must not fail an audit that already ran and was
 * stored — the report is a notification about work that is complete, not part
 * of it, and losing a 6-minute crawl because SMTP was down would be absurd.
 * Returns why it did nothing so the worker can log it.
 */
export async function sendAuditReport(auditId: string): Promise<
  | { sent: true; to: string; messageId: string }
  | { sent: false; reason: string }
> {
  try {
    if (!isEmailConfigured()) return { sent: false, reason: "email not configured" };

    const audit = await prisma.seoAudit.findUnique({
      where: { id: auditId },
      include: {
        site: { include: { user: true } },
        findings: { select: { severity: true, title: true, url: true } },
      },
    });

    if (!audit) return { sent: false, reason: "audit not found" };
    if (audit.status !== "done") return { sent: false, reason: `status is ${audit.status}` };

    const user = audit.site.user;
    if (!user.notifyEmail) return { sent: false, reason: "no notification address" };
    if (!user.notifyEmailVerifiedAt) return { sent: false, reason: "address not verified" };
    if (!user.notifyOnAudit) return { sent: false, reason: "reports turned off" };

    // The run before this one, for the trend line. Matched on createdAt rather
    // than taking "the second newest", so a rerun triggered while this one was
    // in flight cannot be picked as the predecessor.
    const previous = await prisma.seoAudit.findFirst({
      where: {
        siteId: audit.siteId,
        status: "done",
        score: { not: null },
        createdAt: { lt: audit.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { score: true },
    });

    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const finding of audit.findings) {
      if (finding.severity in counts) counts[finding.severity as keyof typeof counts] += 1;
    }

    const topFindings = [...audit.findings]
      .sort(
        (a, b) =>
          SEVERITY_ORDER.indexOf(a.severity as (typeof SEVERITY_ORDER)[number]) -
          SEVERITY_ORDER.indexOf(b.severity as (typeof SEVERITY_ORDER)[number]),
      )
      .slice(0, MAX_FINDINGS_IN_EMAIL);

    const locale: Locale = isLocale(user.locale) ? user.locale : "en";
    const message = auditReportEmail(locale, {
      siteName: audit.site.name,
      score: audit.score ?? 0,
      previousScore: previous?.score ?? null,
      summary: audit.summary,
      counts,
      topFindings,
      auditUrl: `${appUrl()}/sites/${audit.siteId}/seo?audit=${audit.id}`,
      costUsd: numberField(audit.aiMeta, "costUsd") ?? null,
    });

    const { id } = await sendEmail({ to: user.notifyEmail, ...message });
    return { sent: true, to: user.notifyEmail, messageId: id };
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
