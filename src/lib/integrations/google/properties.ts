import { listProperties, propertyToDomain } from "./gsc";
import { getValidGoogleAccessToken } from "./oauth";
import { prisma } from "@/lib/prisma";

export type BoundProperty = {
  siteUrl: string;
  domain: string;
  permissionLevel: string;
  /** Set when this property is already bound to a Site. */
  siteId: string | null;
};

export type GooglePropertyList = {
  accountLabel: string;
  properties: BoundProperty[];
};

export class NoGoogleConnectionError extends Error {
  constructor() {
    super("no_google_connection");
    this.name = "NoGoogleConnectionError";
  }
}

/**
 * Search Console properties for a user's Google connection, annotated with
 * which ones are already bound to a Site.
 *
 * Shared by the route handler and the Connections page so the page can render
 * server-side without an extra HTTP round-trip.
 */
export async function getGoogleProperties(userId: string): Promise<GooglePropertyList> {
  const connection = await prisma.connection.findFirst({
    where: { userId, provider: "GOOGLE" },
  });
  if (!connection) throw new NoGoogleConnectionError();

  const accessToken = await getValidGoogleAccessToken(connection);
  const properties = await listProperties(accessToken);

  const bindings = await prisma.binding.findMany({
    where: { connectionId: connection.id },
    select: { resourceId: true, siteId: true },
  });
  const siteByResource = new Map(bindings.map((b) => [b.resourceId, b.siteId]));

  return {
    accountLabel: connection.accountLabel,
    properties: properties
      .map((p) => ({
        siteUrl: p.siteUrl,
        domain: propertyToDomain(p.siteUrl),
        permissionLevel: p.permissionLevel,
        siteId: siteByResource.get(p.siteUrl) ?? null,
      }))
      .sort((a, b) => a.domain.localeCompare(b.domain)),
  };
}
