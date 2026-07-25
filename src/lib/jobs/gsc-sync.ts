import { prisma } from "@/lib/prisma";
import {
  type GscRow,
  searchAnalytics,
} from "@/lib/integrations/google/gsc";
import { getValidGoogleAccessToken } from "@/lib/integrations/google/oauth";
import { addDays, formatDay, parseDay, todayUtc } from "@/lib/utils";

/** GSC data lands 2–3 days late, so "yesterday" is usually still empty. */
export const GSC_REPORTING_LAG_DAYS = 2;

type DimensionSpec = {
  /** Value stored in GscDaily.dimension */
  name: "total" | "query" | "page" | "country" | "device";
  /** Dimensions sent to the API; always date-first. */
  apiDimensions: string[];
  maxRows: number;
};

const DIMENSIONS: DimensionSpec[] = [
  { name: "total", apiDimensions: ["date"], maxRows: 2_000 },
  { name: "query", apiDimensions: ["date", "query"], maxRows: 25_000 },
  { name: "page", apiDimensions: ["date", "page"], maxRows: 25_000 },
  { name: "country", apiDimensions: ["date", "country"], maxRows: 10_000 },
  { name: "device", apiDimensions: ["date", "device"], maxRows: 1_000 },
];

const PAGE_SIZE = 25_000; // GSC hard limit per request
const INSERT_CHUNK = 500;

export type GscSyncResult = {
  jobRunId: string;
  from: string;
  to: string;
  rowsByDimension: Record<string, number>;
};

/** Fetch every row for a query, paginating until GSC runs out or we hit the cap. */
async function fetchAllRows(
  accessToken: string,
  property: string,
  spec: DimensionSpec,
  startDate: string,
  endDate: string,
): Promise<GscRow[]> {
  const collected: GscRow[] = [];

  while (collected.length < spec.maxRows) {
    const rowLimit = Math.min(PAGE_SIZE, spec.maxRows - collected.length);
    const rows = await searchAnalytics(accessToken, property, {
      startDate,
      endDate,
      dimensions: spec.apiDimensions,
      rowLimit,
      startRow: collected.length,
    });

    collected.push(...rows);
    if (rows.length < rowLimit) break; // last page
  }

  return collected;
}

function toRecords(siteId: string, spec: DimensionSpec, rows: GscRow[]) {
  return rows.flatMap((row) => {
    const [day, dimValue] = row.keys ?? [];
    if (!day) return [];
    return [
      {
        siteId,
        date: parseDay(day),
        dimension: spec.name,
        dimValue: spec.name === "total" ? "" : (dimValue ?? ""),
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      },
    ];
  });
}

/**
 * Pull a rolling window of Search Console data into GscDaily.
 *
 * Idempotent: the window is deleted and rewritten per dimension, so re-running
 * picks up late-arriving data without creating duplicates (spec §4.1).
 *
 * Runs inline in a route handler for now; move to the BullMQ worker when the
 * pipeline grows past a single API round-trip.
 */
export async function runGscSync(
  siteId: string,
  options: { days?: number } = {},
): Promise<GscSyncResult> {
  const days = options.days ?? 90;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: { bindings: { include: { connection: true } } },
  });
  if (!site) throw new Error("Site not found");

  const binding = site.bindings.find((b) => b.connection.provider === "GOOGLE");
  if (!binding) throw new Error("This site has no Google Search Console property bound");

  const endDate = addDays(todayUtc(), -GSC_REPORTING_LAG_DAYS);
  const startDate = addDays(endDate, -(days - 1));
  const from = formatDay(startDate);
  const to = formatDay(endDate);

  const jobRun = await prisma.jobRun.create({
    data: { type: "gsc_sync", siteId, status: "running" },
  });

  const rowsByDimension: Record<string, number> = {};

  try {
    const accessToken = await getValidGoogleAccessToken(binding.connection);

    // Serial on purpose — keeps us well inside the 1200 QPM quota.
    for (const [index, spec] of DIMENSIONS.entries()) {
      const rows = await fetchAllRows(accessToken, binding.resourceId, spec, from, to);
      const records = toRecords(siteId, spec, rows);

      await prisma.$transaction([
        prisma.gscDaily.deleteMany({
          where: { siteId, dimension: spec.name, date: { gte: startDate, lte: endDate } },
        }),
        ...chunk(records, INSERT_CHUNK).map((batch) =>
          prisma.gscDaily.createMany({ data: batch }),
        ),
      ]);

      rowsByDimension[spec.name] = records.length;

      await prisma.jobRun.update({
        where: { id: jobRun.id },
        data: { progress: Math.round(((index + 1) / DIMENSIONS.length) * 100) },
      });
    }

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: "done",
        progress: 100,
        finishedAt: new Date(),
        logs: { from, to, rowsByDimension },
      },
    });

    return { jobRunId: jobRun.id, from, to, rowsByDimension };
  } catch (error) {
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        logs: {
          from,
          to,
          rowsByDimension,
          error: error instanceof Error ? error.message : String(error),
        },
      },
    });
    throw error;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
