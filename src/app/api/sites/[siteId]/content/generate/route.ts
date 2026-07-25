import { NextResponse } from "next/server";
import { isAiConfigured } from "@/lib/ai/client";
import { topicIdeaSchema } from "@/lib/ai/schemas";
import { getApiUser } from "@/lib/auth";
import { enqueue } from "@/lib/jobs/queue";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ siteId: string }> };

/** Queues outline -> body -> checks for one chosen topic. */
export async function POST(request: Request, { params }: Params) {
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

  const body = await request.json().catch(() => null);
  const topic = topicIdeaSchema.safeParse(body?.topic);
  if (!topic.success) {
    return NextResponse.json({ error: "invalid_topic" }, { status: 400 });
  }

  const job = await enqueue({
    type: "content_generate",
    siteId,
    payload: { topic: topic.data },
  });
  if (!job) return NextResponse.json({ error: "could_not_enqueue" }, { status: 500 });

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
