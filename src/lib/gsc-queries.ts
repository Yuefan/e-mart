import { prisma } from "@/lib/prisma";
import { addDays, daysBetween, formatDay } from "@/lib/utils";

export type Metrics = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SeriesPoint = Metrics & { date: string };

export type BreakdownRow = Metrics & {
  value: string;
  deltaClicks: number;
};

export const BREAKDOWN_DIMENSIONS = ["query", "page", "country", "device"] as const;
export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

type RawRow = {
  clicks: number;
  impressions: number;
  position: number;
};

/**
 * CTR is recomputed from the totals rather than averaged, and position is
 * weighted by impressions — averaging either directly gives wrong answers.
 */
export function aggregate(rows: RawRow[]): Metrics {
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;

  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    weightedPosition += row.position * row.impressions;
  }

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weightedPosition / impressions : 0,
  };
}

export const EMPTY_METRICS: Metrics = { clicks: 0, impressions: 0, ctr: 0, position: 0 };

/** The equally long window immediately before [from, to]. */
export function previousPeriod(from: Date, to: Date): { from: Date; to: Date } {
  const length = daysBetween(from, to);
  return { from: addDays(from, -length), to: addDays(to, -length) };
}

export async function getTimeseries(
  siteId: string,
  from: Date,
  to: Date,
): Promise<SeriesPoint[]> {
  const rows = await prisma.gscDaily.findMany({
    where: { siteId, dimension: "total", date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
    select: { date: true, clicks: true, impressions: true, ctr: true, position: true },
  });

  return rows.map((row) => ({
    date: formatDay(row.date),
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
}

export async function getTotals(siteId: string, from: Date, to: Date): Promise<Metrics> {
  const rows = await prisma.gscDaily.findMany({
    where: { siteId, dimension: "total", date: { gte: from, lte: to } },
    select: { clicks: true, impressions: true, position: true },
  });
  return aggregate(rows);
}

/**
 * Aggregation happens in JS rather than SQL: the sync caps each dimension at
 * 25k rows per window, so the read stays small, and this keeps the query
 * portable when the datasource moves from SQLite to Postgres.
 */
async function aggregateByValue(
  siteId: string,
  dimension: BreakdownDimension,
  from: Date,
  to: Date,
): Promise<Map<string, Metrics>> {
  const rows = await prisma.gscDaily.findMany({
    where: { siteId, dimension, date: { gte: from, lte: to } },
    select: { dimValue: true, clicks: true, impressions: true, position: true },
  });

  const buckets = new Map<string, RawRow[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.dimValue);
    if (bucket) bucket.push(row);
    else buckets.set(row.dimValue, [row]);
  }

  return new Map([...buckets].map(([value, group]) => [value, aggregate(group)]));
}

export async function getBreakdown(
  siteId: string,
  dimension: BreakdownDimension,
  from: Date,
  to: Date,
  options: { limit?: number; compare?: boolean } = {},
): Promise<BreakdownRow[]> {
  const limit = options.limit ?? 25;

  const current = await aggregateByValue(siteId, dimension, from, to);
  let previous = new Map<string, Metrics>();
  if (options.compare !== false) {
    const window = previousPeriod(from, to);
    previous = await aggregateByValue(siteId, dimension, window.from, window.to);
  }

  return [...current]
    .map(([value, metrics]) => ({
      value,
      ...metrics,
      deltaClicks: metrics.clicks - (previous.get(value)?.clicks ?? 0),
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, limit);
}

// ---- derived insight cards (spec §5.1 — computed locally, no AI) ----

export type Insight = {
  value: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  /** Only set for the declining-pages card. */
  deltaClicks?: number;
};

export type Insights = {
  /** High impressions, low CTR, page-2-ish rank: rewrite title/description. */
  opportunityQueries: Insight[];
  /** Rank 11–15: one step from page one. */
  strikingDistancePages: Insight[];
  /** Clicks down >30% versus the previous period. */
  decliningPages: Insight[];
};

export async function getInsights(
  siteId: string,
  from: Date,
  to: Date,
): Promise<Insights> {
  const [queries, pages] = await Promise.all([
    getBreakdown(siteId, "query", from, to, { limit: 5_000 }),
    getBreakdown(siteId, "page", from, to, { limit: 5_000 }),
  ]);

  const opportunityQueries = queries
    .filter((r) => r.impressions > 500 && r.ctr < 0.01 && r.position >= 5 && r.position <= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);

  const strikingDistancePages = pages
    .filter((r) => r.position >= 11 && r.position <= 15)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);

  const decliningPages = pages
    .filter((r) => {
      const before = r.clicks - r.deltaClicks;
      return before >= 10 && r.deltaClicks / before < -0.3;
    })
    .sort((a, b) => a.deltaClicks - b.deltaClicks)
    .slice(0, 10);

  return { opportunityQueries, strikingDistancePages, decliningPages };
}
