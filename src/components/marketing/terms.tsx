import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { MarketingLegalDoc } from "./legal-doc";

export function MarketingTerms({ t, locale }: { t: Dictionary; locale: Locale }) {
  return <MarketingLegalDoc t={t} locale={locale} doc={t.legal.terms} />;
}
