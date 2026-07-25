import { NextResponse } from "next/server";
import { isAiConfigured } from "@/lib/ai/client";
import { getApiUser } from "@/lib/auth";
import { enqueue } from "@/lib/jobs/queue";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ siteId: string }> };

/** Queues topic selection. Poll /api/jobs/[jobId]; results land in `logs.topics`. */
export async function POST(_request: Request, { params }: Params) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { siteId } = await params;
  const site = await prisma.site.findFirst({ where: { id: siteId, userId: user.id } });
  if (!site) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI gateway not configured — see docs/ai-gateway-setup.md" },
      { status: 400 },
    );
  }

  const running = await prisma.jobRun.findFirst({
    where: { siteId, type: "content_ideate", status: { in: ["queued", "running"] } },
  });
  if (running) return NextResponse.json({ jobId: running.id, alreadyRunning: true });

  const job = await enqueue({ type: "content_ideate", siteId, payload: { count: 5 } });
  if (!job) return NextResponse.json({ error: "could_not_enqueue" }, { status: 500 });

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
