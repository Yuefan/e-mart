"use client";

import { useTransition } from "react";
import { setLocale } from "@/app/actions/locale";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { useI18n } from "./i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Two-state language switch.
 *
 * A segmented control rather than a dropdown: with exactly two options both are
 * visible at once, so switching is one click and the current language is
 * legible without opening anything.
 */
export function LocaleToggle({ className }: { className?: string }) {
  const { locale } = useI18n();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === locale || pending) return;
    startTransition(async () => {
      await setLocale(next);
    });
  }

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        "inline-flex rounded-lg border border-line bg-panel p-0.5",
        pending && "opacity-60",
        className,
      )}
    >
      {LOCALES.map((option) => (
        <button
          key={option.code}
          type="button"
          onClick={() => choose(option.code)}
          aria-pressed={option.code === locale}
          disabled={pending}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium transition-colors",
            option.code === locale
              ? "bg-panel-alt text-fg"
              : "text-muted hover:text-fg",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
