import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import {
  BREAKDOWN_DIMENSIONS,
  type BreakdownDimension,
  getBreakdown,
} from "@/lib/gsc-queries";
import { prisma } from "@/lib/prisma";
import { resolveRange } from "@/lib/range";

type Params = { params: Promise<{ siteId: string }> };

function parseDimension(value: string | null): BreakdownDimension | null {
  return BREAKDOWN_DIMENSIONS.includes(value as BreakdownDimension)
    ? (value as BreakdownDimension)
    : null;
}

export async function GET(request: Request, { params }: Params) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { siteId } = await params;
  const site = await prisma.site.findFirst({ where: { id: siteId, userId: user.id } });
  if (!site) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const dimension = parseDimension(searchParams.get("dimension"));
  if (!dimension) {
    return NextResponse.json(
      { error: `dimension must be one of ${BREAKDOWN_DIMENSIONS.join(", ")}` },
      { status: 400 },
    );
  }

  const { from, to } = resolveRange(searchParams);
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 25;

  const rows = await getBreakdown(siteId, dimension, from, to, { limit });
  return NextResponse.json({ dimension, rows });
}
