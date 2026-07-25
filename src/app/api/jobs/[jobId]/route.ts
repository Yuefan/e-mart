import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { STALE_AFTER_MS } from "@/lib/jobs/queue";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ jobId: string }> };

/** Poll target for queued work (spec §2.3 `/api/jobs/[jobId]`). */
export async function GET(_request: Request, { params }: Params) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { jobId } = await params;
  const job = await prisma.jobRun.findUnique({
    where: { id: jobId },
    include: { site: { select: { userId: true } } },
  });

  // A job with no site is a global maintenance job — not the user's to inspect.
  if (!job || job.site?.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // A job sitting in "queued" well past its run time means nothing is draining
  // the queue — surface that instead of letting the UI spin forever.
  const waitedMs = Date.now() - job.runAfter.getTime();
  const workerLikelyDown = job.status === "queued" && waitedMs > 45_000;

  return NextResponse.json({
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    attempts: job.attempts,
    error: job.error,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    logs: job.logs ?? null,
    workerLikelyDown,
    staleAfterMs: STALE_AFTER_MS,
  });
}
