"use client";

import { useState } from "react";
import type { BreakdownRow } from "@/lib/gsc-queries";
import { cn, formatNumber, formatPercent } from "@/lib/utils";

/**
 * Part-to-whole for a small number of categories.
 *
 * Two constraints shape this. A donut only reads at a glance up to about six
 * segments, so anything past the top few is folded into "Other" — Search
 * Console reports 124 countries for this site and a 124-slice ring is noise.
 * And the slices are an *ordered* quantity once sorted by share, so they take a
 * single-hue ramp (darkest = largest) rather than categorical hues: it removes
 * the pairwise-discrimination problem entirely and reads as a ranking.
 *
 * The ring is the glanceable layer; the legend carries the actual numbers,
 * which is also what keeps identity off colour alone.
 */

/** Ramp steps live in globals.css as --share-0..4 so both themes swap in one place. */
const MAX_SLICES = 5;

type Slice = {
  label: string;
  value: number;
  share: number;
  isOther: boolean;
};

function buildSlices(rows: BreakdownRow[], metric: "clicks" | "impressions"): Slice[] {
  const withValue = rows
    .map((row) => ({ label: row.value, value: row[metric] }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = withValue.reduce((sum, row) => sum + row.value, 0);
  if (total === 0) return [];

  const head = withValue.slice(0, MAX_SLICES - 1);
  const tail = withValue.slice(MAX_SLICES - 1);
  const tailValue = tail.reduce((sum, row) => sum + row.value, 0);

  const slices: Slice[] = head.map((row) => ({
    label: row.label,
    value: row.value,
    share: row.value / total,
    isOther: false,
  }));

  if (tailValue > 0) {
    slices.push({
      label: `Other (${tail.length})`,
      value: tailValue,
      share: tailValue / total,
      isOther: true,
    });
  }

  return slices;
}

function formatLabel(label: string, dimension: "country" | "device"): string {
  if (label.startsWith("Other")) return label;
  if (dimension === "country") return label.toUpperCase();
  return label.charAt(0) + label.slice(1).toLowerCase();
}

/** Polar to cartesian on the ring, starting at 12 o'clock. */
function point(cx: number, cy: number, r: number, fraction: number) {
  const angle = fraction * 2 * Math.PI - Math.PI / 2;
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, from: number, to: number) {
  // A full circle cannot be drawn as a single arc — the start and end points
  // coincide and the path collapses.
  if (to - from >= 0.9999) {
    return [
      `M ${cx} ${cy - rOuter}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${cx - 0.01} ${cy - rOuter}`,
      `M ${cx} ${cy - rInner}`,
      `A ${rInner} ${rInner} 0 1 0 ${cx - 0.01} ${cy - rInner}`,
      "Z",
    ].join(" ");
  }

  const [x1, y1] = point(cx, cy, rOuter, from);
  const [x2, y2] = point(cx, cy, rOuter, to);
  const [x3, y3] = point(cx, cy, rInner, to);
  const [x4, y4] = point(cx, cy, rInner, from);
  const large = to - from > 0.5 ? 1 : 0;

  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

export function ShareDonut({
  rows,
  dimension,
  metric = "clicks",
}: {
  rows: BreakdownRow[];
  dimension: "country" | "device";
  metric?: "clicks" | "impressions";
}) {
  const [active, setActive] = useState<number | null>(null);
  const slices = buildSlices(rows, metric);

  if (slices.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-muted">
        No {metric} in this window.
      </p>
    );
  }

  const size = 148;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 68;
  const rInner = 42;
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  // Cumulative offsets computed by reduce rather than a mutable cursor, so
  // nothing is reassigned during render.
  const arcs = slices.reduce<{ slice: Slice; index: number; from: number; to: number }[]>(
    (acc, slice, index) => {
      const from = acc.length === 0 ? 0 : acc[acc.length - 1].to;
      acc.push({ slice, index, from, to: from + slice.share });
      return acc;
    },
    [],
  );

  const focused = active !== null ? slices[active] : null;

  return (
    <div className="flex flex-wrap items-center gap-6 px-5 py-4">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${dimension} share of ${metric}: ${slices
          .map((s) => `${formatLabel(s.label, dimension)} ${formatPercent(s.share, 0)}`)
          .join(", ")}`}
        className="shrink-0"
        onMouseLeave={() => setActive(null)}
      >
        {arcs.map(({ slice, index, from, to }) => (
          <path
            key={slice.label}
            d={arcPath(cx, cy, rOuter, rInner, from, to)}
            fill={`var(--share-${index})`}
            // A 2px surface-coloured ring separates neighbouring fills so the
            // boundary reads without a border colour of its own.
            stroke="var(--panel)"
            strokeWidth={2}
            opacity={active === null || active === index ? 1 : 0.35}
            onMouseEnter={() => setActive(index)}
            className="cursor-default transition-opacity"
          />
        ))}

        <text
          x={cx}
          y={cy - 5}
          textAnchor="middle"
          className="tnum fill-fg text-sm font-semibold"
        >
          {focused ? formatPercent(focused.share, 0) : formatNumber(total)}
        </text>
        <text x={cx} y={cy + 11} textAnchor="middle" className="fill-muted text-[10px]">
          {focused ? formatLabel(focused.label, dimension) : metric}
        </text>
      </svg>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.map((slice, index) => (
          <li
            key={slice.label}
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            className={cn(
              "flex items-baseline gap-2 text-sm transition-opacity",
              active !== null && active !== index && "opacity-50",
            )}
          >
            <span
              aria-hidden
              className="mt-1.5 size-2.5 shrink-0 rounded-sm"
              style={{ background: `var(--share-${index})` }}
            />
            <span className={cn("min-w-0 flex-1 truncate", slice.isOther && "text-muted")}>
              {formatLabel(slice.label, dimension)}
            </span>
            <span className="tnum shrink-0 text-xs text-muted">
              {formatNumber(slice.value)}
            </span>
            <span className="tnum w-11 shrink-0 text-right text-xs">
              {formatPercent(slice.share, 1)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
