import type { Locale } from "@/lib/i18n/config";

/**
 * Email bodies.
 *
 * Written as plain strings rather than JSX: mail clients need table layouts and
 * inline styles, and every message here is a heading plus a list. Each one
 * carries a text/plain alternative — some clients show it, and spam filters
 * treat an HTML-only message as a signal.
 */

/** Prevents user- and crawler-supplied text from breaking out into markup. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SHELL_OPEN =
  '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;' +
  'max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;line-height:1.5">';
const SHELL_CLOSE = "</div>";

const BUTTON =
  "display:inline-block;background:#e2211c;color:#ffffff;text-decoration:none;" +
  "padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px";

const MUTED = "color:#6b6b6b;font-size:12px";

// ---- verification ----------------------------------------------------------

const VERIFY_COPY = {
  en: {
    subject: "Confirm this address for ROARLAND audit reports",
    heading: "Confirm your email",
    intro:
      "Use the button below to start receiving SEO audit reports at this address.",
    button: "Confirm this address",
    fallback: "Or paste this link into your browser:",
    expiry: "The link is good for 24 hours and can be used once.",
    ignore:
      "If you did not ask for this, ignore it — nothing will be sent to this address.",
  },
  zh: {
    subject: "确认接收 ROARLAND 诊断报告的邮箱",
    heading: "确认你的邮箱",
    intro: "点击下面的按钮，即可开始在这个邮箱接收 SEO 诊断报告。",
    button: "确认这个邮箱",
    fallback: "或者把这个链接粘贴到浏览器：",
    expiry: "链接 24 小时内有效，且只能使用一次。",
    ignore: "如果这不是你发起的，忽略即可 —— 我们不会向这个邮箱发送任何内容。",
  },
} satisfies Record<Locale, Record<string, string>>;

export function verificationEmail(locale: Locale, url: string) {
  const c = VERIFY_COPY[locale];
  const safeUrl = esc(url);

  return {
    subject: c.subject,
    html:
      SHELL_OPEN +
      `<h1 style="font-size:20px;margin:0 0 12px">${c.heading}</h1>` +
      `<p style="margin:0 0 20px">${c.intro}</p>` +
      `<p style="margin:0 0 20px"><a href="${safeUrl}" style="${BUTTON}">${c.button}</a></p>` +
      `<p style="${MUTED};margin:0 0 6px">${c.fallback}</p>` +
      `<p style="${MUTED};word-break:break-all;margin:0 0 20px">${safeUrl}</p>` +
      `<p style="${MUTED};margin:0">${c.expiry} ${c.ignore}</p>` +
      SHELL_CLOSE,
    text: [c.heading, "", c.intro, "", url, "", c.expiry, c.ignore].join("\n"),
  };
}

// ---- audit report ----------------------------------------------------------

export type AuditReportData = {
  siteName: string;
  score: number;
  previousScore: number | null;
  summary: string | null;
  counts: { critical: number; high: number; medium: number; low: number };
  topFindings: { severity: string; title: string; url: string | null }[];
  auditUrl: string;
  /** Absent when the run was rule-engine only. */
  costUsd: number | null;
};

const REPORT_COPY = {
  en: {
    subject: (site: string, score: number) => `SEO audit: ${site} scored ${score}/100`,
    heading: "SEO audit complete",
    scoreLabel: "Score",
    unchanged: "unchanged from the previous run",
    noPrevious: "first run",
    delta: (d: number) => `${d > 0 ? "+" : ""}${d} vs. previous run`,
    breakdown: "Findings",
    severities: { critical: "Critical", high: "High", medium: "Medium", low: "Low" },
    topFindings: "Worth reading first",
    button: "Open the full report",
    rulesOnly: "Rule engine only — no AI ran for this audit.",
    cost: (usd: string) => `AI cost for this run: $${usd}`,
    unsubscribe: "Turn these off under Settings → Notifications.",
  },
  zh: {
    subject: (site: string, score: number) => `SEO 诊断：${site} 得分 ${score}/100`,
    heading: "SEO 诊断已完成",
    scoreLabel: "得分",
    unchanged: "与上次运行持平",
    noPrevious: "首次运行",
    delta: (d: number) => `较上次运行 ${d > 0 ? "+" : ""}${d}`,
    breakdown: "发现",
    severities: { critical: "严重", high: "高", medium: "中", low: "低" },
    topFindings: "建议优先看这几条",
    button: "查看完整报告",
    rulesOnly: "本次仅规则引擎运行，未调用 AI。",
    cost: (usd: string) => `本次 AI 花费：$${usd}`,
    unsubscribe: "可在「设置 → 通知」中关闭。",
  },
};

export function auditReportEmail(locale: Locale, data: AuditReportData) {
  const c = REPORT_COPY[locale];
  const delta = data.previousScore === null ? null : data.score - data.previousScore;

  const trend =
    delta === null ? c.noPrevious : delta === 0 ? c.unchanged : c.delta(delta);

  const counts = (["critical", "high", "medium", "low"] as const)
    .filter((key) => data.counts[key] > 0)
    .map((key) => `${c.severities[key]} ${data.counts[key]}`)
    .join(" · ");

  const findingRows = data.topFindings
    .map(
      (finding) =>
        `<li style="margin:0 0 8px">` +
        `<strong>${esc(c.severities[finding.severity as keyof typeof c.severities] ?? finding.severity)}</strong> — ` +
        `${esc(finding.title)}` +
        (finding.url
          ? `<br><span style="${MUTED};word-break:break-all">${esc(finding.url)}</span>`
          : "") +
        `</li>`,
    )
    .join("");

  const costLine =
    data.costUsd === null
      ? c.rulesOnly
      : c.cost(data.costUsd.toFixed(4));

  const html =
    SHELL_OPEN +
    `<h1 style="font-size:20px;margin:0 0 4px">${c.heading}</h1>` +
    `<p style="margin:0 0 20px;${MUTED}">${esc(data.siteName)}</p>` +
    `<p style="margin:0 0 4px;font-size:32px;font-weight:700">${data.score}` +
    `<span style="font-size:16px;font-weight:400;${MUTED}">/100</span></p>` +
    `<p style="margin:0 0 20px;${MUTED}">${trend}</p>` +
    (data.summary
      ? `<p style="margin:0 0 20px;white-space:pre-line">${esc(data.summary)}</p>`
      : "") +
    (counts
      ? `<p style="margin:0 0 6px;font-weight:600">${c.breakdown}</p>` +
        `<p style="margin:0 0 20px">${esc(counts)}</p>`
      : "") +
    (findingRows
      ? `<p style="margin:0 0 6px;font-weight:600">${c.topFindings}</p>` +
        `<ul style="margin:0 0 20px;padding-left:18px">${findingRows}</ul>`
      : "") +
    `<p style="margin:0 0 20px"><a href="${esc(data.auditUrl)}" style="${BUTTON}">${c.button}</a></p>` +
    `<p style="${MUTED};margin:0 0 4px">${costLine}</p>` +
    `<p style="${MUTED};margin:0">${c.unsubscribe}</p>` +
    SHELL_CLOSE;

  const text = [
    c.heading,
    data.siteName,
    "",
    `${c.scoreLabel}: ${data.score}/100 (${trend})`,
    data.summary ?? "",
    "",
    counts ? `${c.breakdown}: ${counts}` : "",
    "",
    ...data.topFindings.map(
      (f) =>
        `- [${c.severities[f.severity as keyof typeof c.severities] ?? f.severity}] ${f.title}` +
        (f.url ? `\n  ${f.url}` : ""),
    ),
    "",
    data.auditUrl,
    "",
    costLine,
    c.unsubscribe,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject: c.subject(data.siteName, data.score), html, text };
}
