import { notFound } from "next/navigation";
import { isAiConfigured, monthlyBudgetUsd, monthlySpendUsd } from "@/lib/ai/client";
import { requireUser } from "@/lib/auth";
import { isBrandVoiceUsable, parseBrandVoice } from "@/lib/brand-voice";
import { prisma } from "@/lib/prisma";
import { BrandVoiceForm } from "@/components/brand-voice-form";
import { DeleteSiteForm, RenameSiteForm } from "@/components/site-admin-forms";
import { Badge, Card, CardHeader } from "@/components/ui";

type PageProps = { params: Promise<{ siteId: string }> };

export default async function SettingsPage({ params }: PageProps) {
  const user = await requireUser();
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
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="mt-0.5 text-sm text-muted">
          {site.name} · <span className="font-mono text-xs">{site.domain}</span>
        </p>
      </header>

      <div className="space-y-4">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                Brand voice
                {isBrandVoiceUsable(brandVoice) ? (
                  <Badge tone="positive">configured</Badge>
                ) : (
                  <Badge>not set</Badge>
                )}
              </span>
            }
            hint="Long-lived context for every content call. Topic selection, outlines and drafts all read from here."
          />
          <BrandVoiceForm siteId={siteId} initial={brandVoice} />
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                AI usage
                {aiReady ? <Badge tone="positive">connected</Badge> : <Badge>not configured</Badge>}
              </span>
            }
            hint="Month-to-date spend, summed from what each run actually reported."
          />
          <div className="px-5 py-4">
            {aiReady ? (
              <>
                <div className="flex items-baseline justify-between">
                  <p className="tnum text-2xl font-semibold">${spent.toFixed(2)}</p>
                  <p className="tnum text-sm text-muted">of ${budget.toFixed(2)}</p>
                </div>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-panel-alt"
                  role="img"
                  aria-label={`${usedPct.toFixed(0)}% of the monthly AI budget used`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(usedPct, spent > 0 ? 2 : 0)}%`,
                      background: usedPct > 90 ? "var(--neg)" : "var(--accent)",
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted">
                  New runs are refused once this ceiling is reached. Change it with{" "}
                  <code className="font-mono">AI_MAX_MONTHLY_USD</code> in{" "}
                  <code className="font-mono">.env</code>.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">
                Set <code className="font-mono">AI_API_KEY</code> in{" "}
                <code className="font-mono">.env</code> to enable prioritisation, rewrites and
                content generation. Audits still run without it — see{" "}
                <code className="font-mono">docs/ai-gateway-setup.md</code>.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Site" hint="Renaming only changes the label in this dashboard." />
          <RenameSiteForm siteId={siteId} name={site.name} />
          {googleBinding ? (
            <div className="border-t border-line px-5 py-3">
              <p className="text-xs text-muted">
                Bound to Search Console property{" "}
                <span className="font-mono">{googleBinding.resourceId}</span> via{" "}
                {googleBinding.connection.accountLabel}
              </p>
            </div>
          ) : null}
        </Card>

        <Card className="border-neg/30">
          <CardHeader title="Delete site" hint="This cannot be undone." />
          <DeleteSiteForm siteId={siteId} name={site.name} />
        </Card>
      </div>
    </main>
  );
}
