import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { appUrl, isGoogleConfigured } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getSessionInfo } from "@/lib/session";
import { ConnectionCard, type ConnectionView } from "@/components/connection-card";
import { GoogleConnectButton } from "@/components/google-connect-button";
import { Badge, Card, CardHeader, EmptyState, buttonClass } from "@/components/ui";

/** Providers the spec plans for, shown so the gaps are visible rather than absent. */
const PLANNED = [
  {
    provider: "CLOUDFLARE",
    label: "Cloudflare",
    auth: "Scoped API token",
    unlocks: "Zone status, DNS overview, cache purge after publishing",
  },
  {
    provider: "GITHUB",
    label: "GitHub",
    auth: "GitHub App",
    unlocks: "Reads config into audits, delivers fixes as pull requests",
  },
  {
    provider: "SHOPIFY",
    label: "Shopify",
    auth: "OAuth (custom app)",
    unlocks: "Publishes drafts, maintains product and page SEO",
  },
];

function formatDateTime(value: Date | null): string {
  if (!value) return "unknown";
  return `${value.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

export default async function AccountPage() {
  const user = await requireUser();
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
        <h1 className="text-lg font-semibold">Account</h1>
        <p className="mt-0.5 text-sm text-muted">
          Who you are signed in as, and every third-party account this dashboard holds a
          credential for.
        </p>
      </header>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Signed in" />
          <div className="px-5 py-4">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Name</dt>
                <dd className="mt-0.5">{user.name ?? <span className="text-muted">—</span>}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Email</dt>
                <dd className="mt-0.5 break-all">{user.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Signed in at</dt>
                <dd className="tnum mt-0.5">{formatDateTime(session?.issuedAt ?? null)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Session expires</dt>
                <dd className="tnum mt-0.5">{formatDateTime(session?.expiresAt ?? null)}</dd>
              </div>
            </dl>

            <p className="mt-4 text-xs text-muted">
              Signing in with Google is what creates this account — there is no separate
              password. The session is an httpOnly cookie; signing out clears it without
              touching the connections below.
            </p>

            <form action="/api/auth/logout" method="post" className="mt-3">
              <button type="submit" className={buttonClass("secondary")}>
                Sign out
              </button>
            </form>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                Connected accounts
                {needsAttention > 0 ? (
                  <Badge tone="negative">{needsAttention} need attention</Badge>
                ) : null}
              </span>
            }
            hint={`${views.length} connected · ${siteCount} site${siteCount === 1 ? "" : "s"} bound`}
            action={
              isGoogleConfigured() ? (
                <GoogleConnectButton
                  returnTo="/account"
                  variant={google.length === 0 ? "primary" : "secondary"}
                  label={google.length === 0 ? "Connect Google" : "Add another Google account"}
                />
              ) : null
            }
          />

          {views.length === 0 ? (
            <EmptyState
              title="No accounts connected"
              description={
                isGoogleConfigured()
                  ? "Connect the Google account that owns your Search Console properties to start."
                  : "Google OAuth is not configured yet — see docs/google-oauth-setup.md."
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
            title="Not connected"
            hint="Later phases of the spec. The data model already has room for them."
          />
          <ul className="divide-y divide-line/60">
            {PLANNED.map((provider) => (
              <li key={provider.provider} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-muted">{provider.label}</p>
                  <Badge>{provider.auth}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">{provider.unlocks}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Where credentials live" />
          <div className="px-5 py-4 text-sm text-muted">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Access and refresh tokens are encrypted with AES-256-GCM before they reach the
                database, each with its own IV. The key is only in{" "}
                <code className="font-mono">.env</code>.
              </li>
              <li>
                No third-party token is ever sent to the browser — every provider call goes
                through this server.
              </li>
              <li>
                Google access is read-only (
                <code className="font-mono">webmasters.readonly</code>), so nothing here can
                change your Search Console settings.
              </li>
              <li>
                Disconnecting revokes the grant with the provider as well as deleting it here.
                You can also review it at{" "}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  Google account permissions
                </a>
                .
              </li>
            </ul>
            <p className="mt-3 text-xs">
              Redirect URI in use: <code className="font-mono">{appUrl()}</code>
            </p>
          </div>
        </Card>
      </div>

      <p className="mt-6 text-xs text-muted">
        Binding properties to sites happens on the{" "}
        <Link href="/connections" className="text-accent hover:underline">
          Connections
        </Link>{" "}
        page.
      </p>
    </main>
  );
}
