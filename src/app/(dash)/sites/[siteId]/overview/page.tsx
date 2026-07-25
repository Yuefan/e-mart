import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  getBreakdown,
  getInsights,
  getTimeseries,
  getTotals,
  previousPeriod,
} from "@/lib/gsc-queries";
import { prisma } from "@/lib/prisma";
import { describeRange, resolveRange } from "@/lib/range";
import { BreakdownTable } from "@/components/breakdown-table";
import { InsightCards } from "@/components/insight-cards";
import { KpiCards } from "@/components/kpi-cards";
import { RangeTabs } from "@/components/range-tabs";
import { SyncButton } from "@/components/sync-button";
import { TrafficChart } from "@/components/traffic-chart";
import { Card, CardHeader, EmptyState } from "@/components/ui";

type PageProps = {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toSearchParams(input: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") params.set(key, value);
  }
  return params;
}

export default async function OverviewPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const { siteId } = await params;

  const site = await prisma.site.findFirst({
    where: { id: siteId, userId: user.id },
    include: { bindings: { include: { connection: true } } },
  });
  if (!site) notFound();

  const { from, to, preset } = resolveRange(toSearchParams(await searchParams));
  const previous = previousPeriod(from, to);
  const basePath = `/sites/${siteId}/overview`;

  const [
    series,
    previousSeries,
    totals,
    previousTotals,
    queries,
    pages,
    countries,
    devices,
    insights,
    lastSync,
  ] = await Promise.all([
    getTimeseries(siteId, from, to),
    getTimeseries(siteId, previous.from, previous.to),
    getTotals(siteId, from, to),
    getTotals(siteId, previous.from, previous.to),
    getBreakdown(siteId, "query", from, to, { limit: 25 }),
    getBreakdown(siteId, "page", from, to, { limit: 25 }),
    getBreakdown(siteId, "country", from, to, { limit: 10 }),
    getBreakdown(siteId, "device", from, to, { limit: 10 }),
    getInsights(siteId, from, to),
    prisma.jobRun.findFirst({
      where: { siteId, type: "gsc_sync" },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const property = site.bindings.find((b) => b.connection.provider === "GOOGLE")?.resourceId;
  const hasData = series.length > 0;
  // A comparison is only honest when the previous window actually has rows.
  const comparable = previousSeries.length > 0;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{site.name}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {property ? <span className="font-mono text-xs">{property}</span> : site.domain}
            {" · "}
            {describeRange(from, to)}
          </p>
          {lastSync ? (
            <p className="mt-1 text-xs text-muted">
              Last sync {lastSync.startedAt.toISOString().replace("T", " ").slice(0, 16)} UTC ·{" "}
              <span className={lastSync.status === "failed" ? "text-neg" : undefined}>
                {lastSync.status}
              </span>
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <RangeTabs basePath={basePath} active={preset} />
          <SyncButton siteId={siteId} days={90} label="Sync" />
        </div>
      </header>

      {!hasData ? (
        <Card>
          <EmptyState
            title="No Search Console data stored yet"
            description="Search Console reports run about two days behind. Run a sync to pull the last 90 days into the dashboard."
            action={<SyncButton siteId={siteId} days={90} variant="primary" />}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <KpiCards totals={totals} previousTotals={comparable ? previousTotals : null} />

          <Card>
            <CardHeader
              title="Search performance"
              hint="One panel per metric — a shared axis across different scales would misrepresent the crossings"
            />
            <TrafficChart
              series={series}
              previousSeries={comparable ? previousSeries : null}
            />
          </Card>

          <InsightCards insights={insights} />

          <div className="grid gap-3 lg:grid-cols-2">
            <BreakdownTable
              title="Top queries"
              dimension="query"
              rows={queries}
              hint={`Top ${queries.length} by clicks`}
            />
            <BreakdownTable
              title="Top pages"
              dimension="page"
              rows={pages}
              hint={`Top ${pages.length} by clicks`}
            />
            <BreakdownTable title="Countries" dimension="country" rows={countries} />
            <BreakdownTable title="Devices" dimension="device" rows={devices} />
          </div>
        </div>
      )}
    </main>
  );
}
