import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---- dates ----
// GscDaily rows are keyed by UTC midnight so a day means the same thing
// regardless of where the server or the browser is.

export const DAY_MS = 24 * 60 * 60 * 1000;

/** `Date` -> `YYYY-MM-DD` (UTC). */
export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` -> UTC-midnight `Date`. */
export function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function todayUtc(): Date {
  return parseDay(formatDay(new Date()));
}

/** Inclusive day count between two UTC-midnight dates. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
}

// ---- formatting ----

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function formatPercent(ratio: number, digits = 2): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatPosition(value: number): string {
  return value.toFixed(1);
}

/** Compact display for long URLs in tables. */
export function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" ? parsed.hostname : parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}
