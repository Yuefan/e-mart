import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { enqueue } from "@/lib/jobs/queue";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ siteId: string }> };

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
