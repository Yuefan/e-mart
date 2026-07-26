"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint } from "@/lib/gsc-queries";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn, formatNumber, formatPercent, formatPosition } from "@/lib/utils";
import { useI18n } from "./i18n-provider";

type MetricKey = "clicks" | "impressions" | "ctr" | "position";

type MetricConfig = {
  key: MetricKey;
  /** Dictionary key rather than the text, so the label follows the locale. */
  label: keyof Dictionary["overview"];
  color: string;
  format: (value: number) => string;
  /** Position 1 is the best rank, so its axis runs downward. */
  reversed?: boolean;
};

const METRICS: MetricConfig[] = [
  { key: "clicks", label: "clicks", color: "var(--clicks)", format: formatNumber },
  {
    key: "impressions",
    label: "impressions",
    color: "var(--impressions)",
    format: formatNumber,
  },
  { key: "ctr", label: "ctr", color: "var(--clicks)", format: (v) => formatPercent(v, 2) },
  {
    key: "position",
    label: "avgPosition",
    color: "var(--impressions)",
    format: formatPosition,
    reversed: true,
  },
];

type ChartPoint = {
  date: string;
  previousDate?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  previousClicks?: number;
  previousImpressions?: number;
  previousCtr?: number;
  previousPosition?: number;
};

function shortDate(day: string, locale: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * One panel per metric rather than a dual-axis chart: two y-scales on shared
 * marks make the crossings look meaningful when they are an artefact of the
 * scaling. Small multiples say the same thing without the illusion.
 */
export function TrafficChart({
  series,
  previousSeries,
}: {
  series: SeriesPoint[];
  previousSeries?: SeriesPoint[] | null;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState<MetricKey[]>(["clicks", "impressions"]);

  const data = useMemo<ChartPoint[]>(
    () =>
      series.map((point, index) => {
        // Aligned by index: day N of this period vs. day N of the previous one.
        const previous = previousSeries?.[index];
        return {
          date: point.date,
          clicks: point.clicks,
          impressions: point.impressions,
          ctr: point.ctr,
          position: point.position,
          previousDate: previous?.date,
          previousClicks: previous?.clicks,
          previousImpressions: previous?.impressions,
          previousCtr: previous?.ctr,
          previousPosition: previous?.position,
        };
      }),
    [series, previousSeries],
  );

  const panels = METRICS.filter((m) => visible.includes(m.key));

  function toggle(key: MetricKey) {
    setVisible((current) =>
      current.includes(key)
        ? current.length > 1
          ? current.filter((k) => k !== key)
          : current // never leave zero panels on screen
        : [...current, key],
    );
  }

  if (series.length === 0) {
    return (
      <p className="px-5 py-14 text-center text-sm text-muted">{t.overview.noRowsYet}</p>
    );
  }

  return (
    <div className="px-5 py-4">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {METRICS.map((metric) => {
          const active = visible.includes(metric.key);
          return (
            <button
              key={metric.key}
              type="button"
              onClick={() => toggle(metric.key)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-line bg-panel-alt text-fg"
                  : "border-transparent text-muted hover:text-fg",
              )}
            >
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ background: active ? metric.color : "var(--line)" }}
              />
              {t.overview[metric.label] as string}
            </button>
          );
        })}
      </div>

      <div className="space-y-5">
        {panels.map((metric) => (
          <MetricPanel
            key={metric.key}
            metric={metric}
            data={data}
            hasPrevious={Boolean(previousSeries)}
          />
        ))}
      </div>
    </div>
  );
}

function MetricPanel({
  metric,
  data,
  hasPrevious,
}: {
  metric: MetricConfig;
  data: ChartPoint[];
  hasPrevious: boolean;
}) {
  const { locale, t } = useI18n();
  const previousKey = `previous${metric.key[0].toUpperCase()}${metric.key.slice(1)}`;
  const bcp47 = locale === "zh" ? "zh-CN" : "en-US";

  return (
    <figure className="m-0">
      <figcaption className="mb-1 flex items-center gap-3">
        <span className="text-xs font-semibold">{t.overview[metric.label] as string}</span>
        {hasPrevious ? (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <svg width="18" height="6" aria-hidden>
              <line
                x1="0"
                y1="3"
                x2="18"
                y2="3"
                stroke="var(--muted)"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            </svg>
            {t.overview.previousPeriod}
          </span>
        ) : null}
      </figcaption>

      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(day: string) => shortDate(day, bcp47)}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--line)" }}
            minTickGap={32}
          />
          <YAxis
            width={52}
            reversed={metric.reversed}
            domain={metric.reversed ? [1, "auto"] : [0, "auto"]}
            tickFormatter={metric.format}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as ChartPoint;
              const current = point[metric.key];
              const previous = point[previousKey as keyof ChartPoint] as number | undefined;

              return (
                <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg">
                  <p className="font-medium">{shortDate(point.date, bcp47)}</p>
                  <p className="tnum mt-1 flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ background: metric.color }}
                    />
                    {metric.format(current)}
                  </p>
                  {previous !== undefined ? (
                    <p className="tnum mt-0.5 text-muted">
                      {metric.format(previous)}
                      {point.previousDate ? ` · ${shortDate(point.previousDate, bcp47)}` : ""}
                    </p>
                  ) : null}
                </div>
              );
            }}
          />
          {hasPrevious ? (
            <Line
              type="monotone"
              dataKey={previousKey}
              stroke="var(--muted)"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
          ) : null}
          <Line
            type="monotone"
            dataKey={metric.key}
            stroke={metric.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--panel)" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}
