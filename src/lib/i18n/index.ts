import "server-only";

import { cookies } from "next/headers";
import { type Dictionary, dictionaries } from "./dictionaries";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, isLocale } from "./config";

/**
 * Locale lives in a cookie rather than the URL.
 *
 * A `/[locale]/…` segment is the usual answer, but it would mean moving every
 * route and rewriting every internal link — a large diff against a running
 * deployment for benefits this app cannot use: it is behind a login, so there
 * is no SEO to gain and no public link to share in a particular language.
 */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/** Convenience for server components: the locale and its copy in one await. */
export async function getT(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}

export type { Dictionary, Locale };
export { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES, isLocale } from "./config";
