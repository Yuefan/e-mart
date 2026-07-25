import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { runGscSync } from "@/lib/jobs/gsc-sync";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ siteId: string }> };

// A 90-day backfill is 5 serial GSC round-trips; give it room.
export const maxDuration = 300;

export async function POST(request: Request, { params }: Params) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { siteId } = await params;
  const site = await prisma.site.findFirst({ where: { id: siteId, userId: user.id } });
  if (!site) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const daysParam = Number(new URL(request.url).searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 480) : 90;

  try {
    const result = await runGscSync(siteId, { days });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[gsc/sync]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "sync_failed" },
      { status: 502 },
    );
  }
}
