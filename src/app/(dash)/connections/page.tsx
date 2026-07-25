import { requireUser } from "@/lib/auth";
import {
  type GooglePropertyList,
  getGoogleProperties,
} from "@/lib/integrations/google/properties";
import { prisma } from "@/lib/prisma";
import { PropertyPicker } from "@/components/property-picker";
import { Badge, Card, CardHeader, buttonClass } from "@/components/ui";

const PLANNED_PROVIDERS = [
  { name: "Cloudflare", note: "Scoped API token — zone status, DNS, cache purge" },
  { name: "GitHub", note: "GitHub App — read code for audits, ship fixes as PRs" },
  { name: "Shopify", note: "OAuth — publish articles, maintain page SEO" },
];

export default async function ConnectionsPage() {
  const user = await requireUser();

  const google = await prisma.connection.findFirst({
    where: { userId: user.id, provider: "GOOGLE" },
    select: { accountLabel: true, status: true, scopes: true, updatedAt: true },
  });

  // Fetched here rather than in the client so the list is server-rendered and
  // a failing Google call degrades into a message instead of a blank panel.
  let propertyList: GooglePropertyList | null = null;
  let propertyError: string | undefined;
  if (google) {
    try {
      propertyList = await getGoogleProperties(user.id);
    } catch (error) {
      propertyError = error instanceof Error ? error.message : "Failed to load properties";
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">Connections</h1>
        <p className="mt-1 text-sm text-muted">
          Authorizations are stored per account; each site binds to a specific resource.
        </p>
      </header>

      <div className="space-y-4">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                Google Search Console
                {google ? (
                  <Badge tone={google.status === "active" ? "positive" : "negative"}>
                    {google.status}
                  </Badge>
                ) : (
                  <Badge>not connected</Badge>
                )}
              </span>
            }
            hint={
              google
                ? `${google.accountLabel} · read-only · connected ${google.updatedAt.toISOString().slice(0, 10)}`
                : "Authorize to list your verified properties"
            }
            action={
              <a
                href="/api/connections/google/start?returnTo=/connections"
                className={buttonClass(google ? "secondary" : "primary")}
              >
                {google ? "Re-authorize" : "Connect"}
              </a>
            }
          />
          {google ? (
            <PropertyPicker
              accountLabel={propertyList?.accountLabel ?? google.accountLabel}
              properties={propertyList?.properties ?? []}
              error={propertyError}
            />
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Not connected yet"
            hint="Later phases of the spec — the data model already has room for them"
          />
          <ul className="divide-y divide-line/60">
            {PLANNED_PROVIDERS.map((provider) => (
              <li key={provider.name} className="flex items-center gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-muted">{provider.name}</p>
                  <p className="truncate text-xs text-muted">{provider.note}</p>
                </div>
                <Badge>planned</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </main>
  );
}
