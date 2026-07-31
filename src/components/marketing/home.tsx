import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { marketingFontVariables, bodyFont } from "./fonts";
import { MarketingNavbar } from "./navbar";
import { MarketingHero } from "./hero";
import { MarketingFeatures } from "./features";
import { MarketingIntegration } from "./integration";
import { MarketingWhyUs } from "./why-us";
import { MarketingFAQ } from "./faq";
import { MarketingCTA } from "./cta";
import { MarketingFooter } from "./footer";

export function MarketingHome({ t, locale }: { t: Dictionary; locale: Locale }) {
  return (
    <main className={marketingFontVariables} style={{ ...bodyFont[locale], background: "var(--bg)" }}>
      <MarketingNavbar t={t} />
      <MarketingHero t={t} locale={locale} />
      <MarketingFeatures t={t} locale={locale} />
      <MarketingIntegration t={t} locale={locale} />
      <MarketingWhyUs t={t} locale={locale} />
      <MarketingFAQ t={t} locale={locale} />
      <MarketingCTA t={t} locale={locale} />
      <MarketingFooter t={t} locale={locale} />
    </main>
  );
}
