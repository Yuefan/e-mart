/**
 * Locale constants shared by server and client.
 *
 * Kept apart from ./index.ts because that module imports `next/headers`, which
 * cannot be bundled for the client. A client component importing a single type
 * from there would drag the whole server-only module in and fail the build.
 */

export type Locale = "en" | "zh";

export const LOCALE_COOKIE = "amd_locale";
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "zh", label: "中文" },
];

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh";
}
