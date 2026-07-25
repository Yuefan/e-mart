import { listProperties, propertyToDomain } from "./gsc";
import { getValidGoogleAccessToken } from "./oauth";
import { prisma } from "@/lib/prisma";

export type BoundProperty = {
  siteUrl: string;
  domain: string;
  permissionLevel: string;
  /** Set when this property is already bound to a Site. */
  siteId: string | null;
  /** Which connected account this property came from. */
  connectionId: string;
  accountLabel: string;
};

export type GoogleAccountSummary = {
  connectionId: string;
  accountLabel: string;
  status: string;
  /** Set when this account's properties could not be listed. */
  error: string | null;
  propertyCount: number;
};

export type GooglePropertyList = {
  accounts: GoogleAccountSummary[];
  properties: BoundProperty[];
};

export class NoGoogleConnectionError extends Error {
  constructor() {
    super("no_google_connection");
    this.name = "NoGoogleConnectionError";
  }
}

/**
 * Search Console properties across *every* connected Google account, annotated
 * with which ones are already bound to a Site.
 *
 * Iterating all connections rather than the first one matters once a second
 * account is linked: properties are frequently split across a personal and a
 * work Google account, and listing only one silently hides half the sites.
 *
 * One account failing (an expired grant, a revoked token) must not blank the
 * others, so failures are reported per account instead of thrown.
 */
export async function getGoogleProperties(userId: string): Promise<GooglePropertyList> {
  const connections = await prisma.connection.findMany({
    where: { userId, provider: "GOOGLE" },
    orderBy: { createdAt: "asc" },
  });
  if (connections.length === 0) throw new NoGoogleConnectionError();

  const bindings = await prisma.binding.findMany({
    where: { connection: { userId, provider: "GOOGLE" } },
    select: { resourceId: true, siteId: true, connectionId: true },
  });
  const siteByKey = new Map(
    bindings.map((b) => [`${b.connectionId}:${b.resourceId}`, b.siteId]),
  );

  const accounts: GoogleAccountSummary[] = [];
  const properties: BoundProperty[] = [];

  for (const connection of connections) {
    try {
      const accessToken = await getValidGoogleAccessToken(connection);
      const listed = await listProperties(accessToken);

      for (const property of listed) {
        properties.push({
          siteUrl: property.siteUrl,
          domain: propertyToDomain(property.siteUrl),
          permissionLevel: property.permissionLevel,
          siteId: siteByKey.get(`${connection.id}:${property.siteUrl}`) ?? null,
          connectionId: connection.id,
          accountLabel: connection.accountLabel,
        });
      }

      accounts.push({
        connectionId: connection.id,
        accountLabel: connection.accountLabel,
        status: "active",
        error: null,
        propertyCount: listed.length,
      });
    } catch (error) {
      accounts.push({
        connectionId: connection.id,
        accountLabel: connection.accountLabel,
        status: "expired",
        error: error instanceof Error ? error.message : "Could not list properties",
        propertyCount: 0,
      });
    }
  }

  properties.sort(
    (a, b) => a.domain.localeCompare(b.domain) || a.accountLabel.localeCompare(b.accountLabel),
  );

  return { accounts, properties };
}
