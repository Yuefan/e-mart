import { GSC_REPORTING_LAG_DAYS } from "@/lib/jobs/gsc-sync";
import { addDays, formatDay, parseDay, todayUtc } from "@/lib/utils";

export const RANGE_PRESETS = {
  "7d": { label: "7D", days: 7 },
  "28d": { label: "28D", days: 28 },
  "3m": { label: "3M", days: 90 },
  "6m": { label: "6M", days: 180 },
  "12m": { label: "12M", days: 365 },
} as const;

export type RangePreset = keyof typeof RANGE_PRESETS;
export const DEFAULT_RANGE: RangePreset = "28d";

export function isRangePreset(value: string | null): value is RangePreset {
  return value != null && value in RANGE_PRESETS;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Latest day Search Console is likely to have data for. */
export function latestAvailableDay(): Date {
  return addDays(todayUtc(), -GSC_REPORTING_LAG_DAYS);
}

/**
 * Resolve `?range=28d` or `?from=&to=` into a concrete UTC day window.
 * Falls back to the default preset when the input is missing or malformed.
 */
export function resolveRange(searchParams: URLSearchParams): {
  from: Date;
  to: Date;
  preset: RangePreset | "custom";
} {
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (fromParam && toParam && DAY_PATTERN.test(fromParam) && DAY_PATTERN.test(toParam)) {
    const from = parseDay(fromParam);
    const to = parseDay(toParam);
    if (from <= to) return { from, to, preset: "custom" };
  }

  const rangeParam = searchParams.get("range");
  const preset: RangePreset = isRangePreset(rangeParam) ? rangeParam : DEFAULT_RANGE;
  const to = latestAvailableDay();
  const from = addDays(to, -(RANGE_PRESETS[preset].days - 1));

  return { from, to, preset };
}

export function describeRange(from: Date, to: Date): string {
  return `${formatDay(from)} → ${formatDay(to)}`;
}
