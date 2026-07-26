"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { LOCALE_COOKIE, type Locale, isLocale } from "@/lib/i18n/config";
import { prisma } from "@/lib/prisma";

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

  // Mirrored onto the user so background jobs can pick a language. A worker
  // sending an audit report has no request and therefore no cookie to read;
  // without this copy every email would have to default to English.
  const user = await getCurrentUser();
  if (user) {
    await prisma.user.update({ where: { id: user.id }, data: { locale } });
  }

  // Every page reads the cookie during render, so the whole tree is stale.
  revalidatePath("/", "layout");
}
