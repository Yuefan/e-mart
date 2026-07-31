import { getT } from "@/lib/i18n";
import { MarketingPrivacy } from "@/components/marketing/privacy";

export default async function PrivacyPage() {
  const { t, locale } = await getT();
  return <MarketingPrivacy t={t} locale={locale} />;
}
