import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n";
import { MarketingHome } from "@/components/marketing/home";

/** Signed-in visitors go straight to their dashboard; everyone else sees the marketing page. */
export default async function Home() {
  const user = await getCurrentUser();
  if (user) {
    const site = await prisma.site.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    redirect(site ? `/sites/${site.id}/overview` : "/connections");
  }

  const { t, locale } = await getT();
  return <MarketingHome t={t} locale={locale} />;
}
