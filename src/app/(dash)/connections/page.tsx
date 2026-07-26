import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import {
  type GooglePropertyList,
  getGoogleProperties,
} from "@/lib/integrations/google/properties";
import { prisma } from "@/lib/prisma";
import { GoogleConnectButton } from "@/components/google-connect-button";
import { PropertyPicker } from "@/components/property-picker";
import { Badge, Card, CardHeader } from "@/components/ui";

/** Product names are trademarks; only the note is translated. */
const PLANNED_PROVIDERS = [
  { name: "Cloudflare", note: "cloudflareNote" },
  { name: "GitHub", note: "githubNote" },
  { name: "Shopify", note: "shopifyNote" },
] as const;

export default async function ConnectionsPage() {
  const user = await requireUser();
  const { t } = await getT();

  const googleConnections = await prisma.connection.findMany({
    where: { userId: user.id, provider: "GOOGLE" },
    orderBy: { createdAt: "asc" },
    select: { accountLabel: true, status: true },
  });
  const google = googleConnections[0] ?? null;

  // Fetched here rather than in the client so the list is server-rendered and
  // a failing Google call degrades into a message instead of a blank panel.
  let propertyList: GooglePropertyList | null = null;
  let propertyError: string | undefined;
  if (google) {
    try {
      propertyList = await getGoogleProperties(user.id);
    } catch (error) {
      propertyError = error instanceof Error ? error.message : t.connections.loadFailed;
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">{t.connections.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.connections.intro}</p>
      </header>

      <div className="space-y-4">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                {t.connections.googleTitle}
                {google ? (
                  <Badge tone={google.status === "active" ? "positive" : "negative"}>
                    {t.account.statuses[google.status as keyof typeof t.account.statuses] ??
                      google.status}
                  </Badge>
                ) : (
                  <Badge>{t.common.notConnected}</Badge>
                )}
              </span>
            }
            hint={
              google
                ? `${googleConnections.map((c) => c.accountLabel).join(", ")} · ${t.connections.readOnly}`
                : t.connections.authorizePrompt
            }
            action={
              <GoogleConnectButton
                returnTo="/connections"
                variant={google ? "secondary" : "primary"}
                label={google ? t.connections.addAccount : t.connections.connect}
              />
            }
          />
          {google ? (
            <PropertyPicker
              accounts={
                propertyList?.accounts ??
                googleConnections.map((connection, index) => ({
                  connectionId: String(index),
                  accountLabel: connection.accountLabel,
                  status: connection.status,
                  error: propertyError ?? null,
                  propertyCount: 0,
                }))
              }
              properties={propertyList?.properties ?? []}
              error={propertyError}
            />
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title={t.connections.notConnectedYet}
            hint={t.connections.notConnectedHint}
          />
          <ul className="divide-y divide-line/60">
            {PLANNED_PROVIDERS.map((provider) => (
              <li key={provider.name} className="flex items-center gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-muted">{provider.name}</p>
                  <p className="truncate text-xs text-muted">
                    {t.connections[provider.note]}
                  </p>
                </div>
                <Badge>{t.common.planned}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </main>
  );
}
