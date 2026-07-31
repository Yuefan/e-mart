import { getT } from "@/lib/i18n";
import { MarketingTerms } from "@/components/marketing/terms";

export default async function TermsPage() {
  const { t, locale } = await getT();
  return <MarketingTerms t={t} locale={locale} />;
}
