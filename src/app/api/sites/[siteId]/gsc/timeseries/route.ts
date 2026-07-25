import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { getTimeseries, getTotals, previousPeriod } from "@/lib/gsc-queries";
import { prisma } from "@/lib/prisma";
import { resolveRange } from "@/lib/range";
import { formatDay } from "@/lib/utils";

type Params = { params: Promise<{ siteId: string }> };

export async function GET(request: Request, { params }: Params) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { siteId } = await params;
  const site = await prisma.site.findFirst({ where: { id: siteId, userId: user.id } });
  if (!site) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const { from, to, preset } = resolveRange(searchParams);
  const compare = searchParams.get("compare") !== "none";

  const previous = previousPeriod(from, to);
  const [series, totals, previousTotals, previousSeries] = await Promise.all([
    getTimeseries(siteId, from, to),
    getTotals(siteId, from, to),
    compare ? getTotals(siteId, previous.from, previous.to) : null,
    compare ? getTimeseries(siteId, previous.from, previous.to) : null,
  ]);

  return NextResponse.json({
    range: { from: formatDay(from), to: formatDay(to), preset },
    series,
    totals,
    previousTotals,
    // Aligned by index so the chart can overlay it as a dashed comparison line.
    previousSeries: previousSeries?.map((point) => ({
      date: point.date,
      clicks: point.clicks,
      impressions: point.impressions,
      ctr: point.ctr,
      position: point.position,
    })),
  });
}
