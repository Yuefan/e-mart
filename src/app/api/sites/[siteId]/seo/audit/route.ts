import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { STALE_AFTER_MS, enqueue } from "@/lib/jobs/queue";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ siteId: string }> };

/**
 * Whether an audit is in flight for this site.
 *
 * The button needs this on mount, not just after it starts one: an audit runs
 * for minutes in the worker, so navigating away and back — or opening the page
 * in another tab — would otherwise show an idle button while the run continues
 * in the background, and clicking it again looks like it does nothing (the
 * POST returns the existing job rather than starting a second one).
 */
export async function GET(_request: Request, { params }: Params) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { siteId } = await params;
  const site = await prisma.site.findFirst({ where: { id: siteId, userId: user.id } });
  if (!site) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const active = await prisma.jobRun.findFirst({
    where: { siteId, type: "seo_audit", status: { in: ["queued", "running"] } },
    orderBy: { startedAt: "desc" },
  });

  if (!active) return NextResponse.json({ active: null });

  const waitedMs = Date.now() - active.runAfter.getTime();

  return NextResponse.json({
    active: {
      id: active.id,
      type: active.type,
      status: active.status,
      progress: active.progress,
      error: active.error,
      logs: active.logs ?? null,
      workerLikelyDown: active.status === "queued" && waitedMs > 45_000,
      staleAfterMs: STALE_AFTER_MS,
    },
  });
}

/**
 * Queues an audit rather than running it inline: a 50-page crawl plus an AI
 * call takes minutes, which is exactly what the web/worker split exists for.
 * Poll /api/jobs/[jobId] for progress.
 */
export async function POST(_request: Request, { params }: Params) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { siteId } = await params;
  const site = await prisma.site.findFirst({ where: { id: siteId, userId: user.id } });
  if (!site) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const running = await prisma.jobRun.findFirst({
    where: { siteId, type: "seo_audit", status: { in: ["queued", "running"] } },
  });
  if (running) {
    return NextResponse.json({ jobId: running.id, alreadyRunning: true });
  }

  const job = await enqueue({
    type: "seo_audit",
    siteId,
    payload: { triggeredBy: "manual" },
  });
  if (!job) return NextResponse.json({ error: "could_not_enqueue" }, { status: 500 });

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
