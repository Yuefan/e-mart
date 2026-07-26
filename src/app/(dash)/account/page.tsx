import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { appUrl, isGoogleConfigured } from "@/lib/env";
import { getT } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { prisma } from "@/lib/prisma";
import { getSessionInfo } from "@/lib/session";
import { ConnectionCard, type ConnectionView } from "@/components/connection-card";
import { GoogleConnectButton } from "@/components/google-connect-button";
import { Badge, Card, CardHeader, EmptyState, buttonClass } from "@/components/ui";

/**
 * Providers the spec plans for, shown so the gaps are visible rather than
 * absent. Product names are trademarks and stay untranslated; only the auth
 * mechanism and the description come from the dictionary.
 */
const PLANNED = [
  { key: "cloudflare", label: "Cloudflare" },
  { key: "github", label: "GitHub" },
  { key: "shopify", label: "Shopify" },
] as const;

function formatDateTime(value: Date | null, unknown: string): string {
  if (!value) return unknown;
  return `${value.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

export default async function AccountPage() {
  const user = await requireUser();
  const { t } = await getT();
  const [session, connections, siteCount] = await Promise.all([
    getSessionInfo(),
    prisma.connection.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: {
        bindings: { include: { site: { select: { id: true, name: true } } } },
      },
    }),
    prisma.site.count({ where: { userId: user.id } }),
  ]);

  const views: ConnectionView[] = connections.map((connection) => ({
    id: connection.id,
    provider: connection.provider,
    accountLabel: connection.accountLabel,
    status: connection.status,
    scopes: connection.scopes,
    expiresAt: connection.expiresAt?.toISOString() ?? null,
    hasRefreshToken: Boolean(connection.encRefreshToken),
    connectedAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
    boundSites: connection.bindings.map((binding) => ({
      id: binding.site.id,
      name: binding.site.name,
      resourceId: binding.resourceId,
    })),
  }));

  const google = views.filter((view) => view.provider === "GOOGLE");
  const needsAttention = views.filter((view) => view.status !== "active").length;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">{t.account.title}</h1>
        <p className="mt-0.5 text-sm text-muted">{t.account.intro}</p>
      </header>

      <div className="space-y-4">
        <Card>
          <CardHeader title={t.account.signedIn} />
          <div className="px-5 py-4">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">{t.account.name}</dt>
                <dd className="mt-0.5">{user.name ?? <span className="text-muted">—</span>}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t.account.email}</dt>
                <dd className="mt-0.5 break-all">{user.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t.account.signedInAt}</dt>
                <dd className="tnum mt-0.5">{formatDateTime(session?.issuedAt ?? null, t.account.unknownTime)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t.account.sessionExpires}</dt>
                <dd className="tnum mt-0.5">{formatDateTime(session?.expiresAt ?? null, t.account.unknownTime)}</dd>
              </div>
            </dl>

            <p className="mt-4 text-xs text-muted">{t.account.sessionNote}</p>

            <form action="/api/auth/logout" method="post" className="mt-3">
              <button type="submit" className={buttonClass("secondary")}>
                {t.common.signOut}
              </button>
            </form>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                {t.account.connectedAccounts}
                {needsAttention > 0 ? (
                  <Badge tone="negative">
                    {fmt(t.account.needAttention, { n: needsAttention })}
                  </Badge>
                ) : null}
              </span>
            }
            hint={fmt(
              t.account.connectedSummary,
              { accounts: views.length, sites: siteCount },
              siteCount,
            )}
            action={
              isGoogleConfigured() ? (
                <GoogleConnectButton
                  returnTo="/account"
                  variant={google.length === 0 ? "primary" : "secondary"}
                  label={google.length === 0 ? t.account.connectGoogle : t.account.addAnotherGoogle}
                />
              ) : null
            }
          />

          {views.length === 0 ? (
            <EmptyState
              title={t.account.noAccounts}
              description={
                isGoogleConfigured() ? t.account.noAccountsHint : t.account.noAccountsUnconfigured
              }
            />
          ) : (
            <div className="divide-y divide-line/60">
              {views.map((view) => (
                <ConnectionCard key={view.id} connection={view} />
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title={t.account.notConnectedTitle}
            hint={t.account.notConnectedHint}
          />
          <ul className="divide-y divide-line/60">
            {PLANNED.map((provider) => (
              <li key={provider.key} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-muted">{provider.label}</p>
                  <Badge>{t.account.planned[provider.key].auth}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {t.account.planned[provider.key].unlocks}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title={t.account.credentialsTitle} />
          <div className="px-5 py-4 text-sm text-muted">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>{t.account.credential1}</li>
              <li>{t.account.credential2}</li>
              <li>{t.account.credential3}</li>
              <li>
                {t.account.credential4}{" "}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  {t.account.googlePermissions}
                </a>
                .
              </li>
            </ul>
            <p className="mt-3 text-xs">
              {t.account.redirectUriInUse} <code className="font-mono">{appUrl()}</code>
            </p>
          </div>
        </Card>
      </div>

      <p className="mt-6 text-xs text-muted">
        {t.account.bindingHint}{" "}
        <Link href="/connections" className="text-accent hover:underline">
          {t.account.connectionsPage}
        </Link>{" "}
        {t.account.page}
      </p>
    </main>
  );
}
