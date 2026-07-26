"use client";

import { createContext, useContext } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

type I18nValue = { locale: Locale; t: Dictionary };

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Makes the dictionary available to client components.
 *
 * The alternative — passing translated strings down as props — works for a
 * couple of levels and then turns into prop-drilling through components that
 * only forward them. The dictionary is a few KB and serialises once into the
 * RSC payload, so context costs less than threading it by hand.
 */
export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: React.ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ locale, t: dictionary }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return value;
}

/** Shorthand for the common case of only needing the copy. */
export function useT(): Dictionary {
  return useI18n().t;
}
