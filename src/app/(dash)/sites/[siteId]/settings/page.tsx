import { notFound } from "next/navigation";
import { isAiConfigured, monthlyBudgetUsd, monthlySpendUsd } from "@/lib/ai/client";
import { requireUser } from "@/lib/auth";
import { isBrandVoiceUsable, parseBrandVoice } from "@/lib/brand-voice";
import { getT } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { prisma } from "@/lib/prisma";
import { BrandVoiceForm } from "@/components/brand-voice-form";
import { DeleteSiteForm, RenameSiteForm } from "@/components/site-admin-forms";
import { Badge, Card, CardHeader } from "@/components/ui";

type PageProps = { params: Promise<{ siteId: string }> };

export default async function SettingsPage({ params }: PageProps) {
  const user = await requireUser();
  const { t } = await getT();
  const { siteId } = await params;

  const site = await prisma.site.findFirst({
    where: { id: siteId, userId: user.id },
    include: { bindings: { include: { connection: true } } },
  });
  if (!site) notFound();

  const brandVoice = parseBrandVoice(site.brandVoice);
  const aiReady = isAiConfigured();
  const [spent, budget] = await Promise.all([
    aiReady ? monthlySpendUsd() : Promise.resolve(0),
    Promise.resolve(monthlyBudgetUsd()),
  ]);
  const usedPct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;

  const googleBinding = site.bindings.find((b) => b.connection.provider === "GOOGLE");

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">{t.settings.title}</h1>
        <p className="mt-0.5 text-sm text-muted">
          {site.name} · <span className="font-mono text-xs">{site.domain}</span>
        </p>
      </header>

      <div className="space-y-4">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                {t.settings.brandVoice}
                {isBrandVoiceUsable(brandVoice) ? (
                  <Badge tone="positive">{t.common.configured}</Badge>
                ) : (
                  <Badge>{t.common.notSet}</Badge>
                )}
              </span>
            }
            hint={t.settings.brandVoiceHint}
          />
          <BrandVoiceForm siteId={siteId} initial={brandVoice} />
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                {t.settings.aiUsage}
                {aiReady ? (
                  <Badge tone="positive">{t.common.connected}</Badge>
                ) : (
                  <Badge>{t.common.notConnected}</Badge>
                )}
              </span>
            }
            hint={t.settings.aiUsageHint}
          />
          <div className="px-5 py-4">
            {aiReady ? (
              <>
                <div className="flex items-baseline justify-between">
                  <p className="tnum text-2xl font-semibold">${spent.toFixed(2)}</p>
                  <p className="tnum text-sm text-muted">
                    {fmt(t.settings.ofBudget, { budget: `$${budget.toFixed(2)}` })}
                  </p>
                </div>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-panel-alt"
                  role="img"
                  aria-label={fmt(t.settings.budgetAria, { pct: usedPct.toFixed(0) })}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(usedPct, spent > 0 ? 2 : 0)}%`,
                      background: usedPct > 90 ? "var(--neg)" : "var(--accent)",
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted">{t.settings.budgetNote}</p>
              </>
            ) : (
              <p className="text-sm text-muted">{t.settings.aiNotConfigured}</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={t.settings.site} hint={t.settings.siteHint} />
          <RenameSiteForm siteId={siteId} name={site.name} />
          {googleBinding ? (
            <div className="border-t border-line px-5 py-3">
              <p className="text-xs text-muted">
                {fmt(t.settings.boundTo, {
                  property: googleBinding.resourceId,
                  account: googleBinding.connection.accountLabel,
                })}
              </p>
            </div>
          ) : null}
        </Card>

        <Card className="border-neg/30">
          <CardHeader title={t.settings.deleteSite} hint={t.settings.deleteWarning} />
          <DeleteSiteForm siteId={siteId} name={site.name} />
        </Card>
      </div>
    </main>
  );
}
