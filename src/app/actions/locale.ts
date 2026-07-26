"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, type Locale, isLocale } from "@/lib/i18n/config";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * Persists the chosen language.
 *
 * Not httpOnly: nothing here is sensitive, and leaving it readable lets the
 * document lang attribute be corrected client-side if a cached shell is ever
 * served with the wrong one.
 */
export async function setLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  // Every page reads the cookie during render, so the whole tree is stale.
  revalidatePath("/", "layout");
}
