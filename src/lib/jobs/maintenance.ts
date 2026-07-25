import { listProperties } from "@/lib/integrations/google/gsc";
import {
  getValidGoogleAccessToken,
  refreshGoogleConnection,
} from "@/lib/integrations/google/oauth";
import { prisma } from "@/lib/prisma";

const ONE_HOUR_MS = 60 * 60 * 1000;

export type MaintenanceResult = {
  checked: number;
  refreshed: number;
  failed: { accountLabel: string; error: string }[];
};

/**
 * Renew every connection expiring within the hour (spec §8). Doing this ahead
 * of time means a long sync never stalls on a token refresh halfway through.
 */
export async function runTokenRefresh(): Promise<MaintenanceResult> {
  const due = await prisma.connection.findMany({
    where: {
      provider: "GOOGLE",
      status: "active",
      expiresAt: { lt: new Date(Date.now() + ONE_HOUR_MS) },
    },
  });

  const result: MaintenanceResult = { checked: due.length, refreshed: 0, failed: [] };

  for (const connection of due) {
    try {
      await refreshGoogleConnection(connection);
      result.refreshed++;
    } catch (error) {
      // refreshGoogleConnection already flipped status to expired.
      result.failed.push({
        accountLabel: connection.accountLabel,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

/**
 * Prove each connection still works by making the cheapest real call the
 * provider offers, and flag the ones that don't (spec §8 healthCheck).
 */
export async function runHealthCheck(): Promise<MaintenanceResult> {
  const connections = await prisma.connection.findMany({ where: { provider: "GOOGLE" } });
  const result: MaintenanceResult = { checked: connections.length, refreshed: 0, failed: [] };

  for (const connection of connections) {
    try {
      const accessToken = await getValidGoogleAccessToken(connection);
      await listProperties(accessToken);

      if (connection.status !== "active") {
        await prisma.connection.update({
          where: { id: connection.id },
          data: { status: "active" },
        });
      }
      result.refreshed++;
    } catch (error) {
      result.failed.push({
        accountLabel: connection.accountLabel,
        error: error instanceof Error ? error.message : String(error),
      });
      await prisma.connection.update({
        where: { id: connection.id },
        data: { status: "expired" },
      });
    }
  }

  return result;
}
