import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { listProperties } from "@/lib/integrations/google/gsc";
import { getValidGoogleAccessToken } from "@/lib/integrations/google/oauth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ connectionId: string }> };

const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

async function loadOwned(connectionId: string, userId: string) {
  return prisma.connection.findFirst({ where: { id: connectionId, userId } });
}

/** Re-checks the credential against the provider and records the verdict. */
export async function POST(_request: Request, { params }: Params) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { connectionId } = await params;
  const connection = await loadOwned(connectionId, user.id);
  if (!connection) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (connection.provider !== "GOOGLE") {
    return NextResponse.json({ error: "unsupported_provider" }, { status: 400 });
  }

  try {
    const accessToken = await getValidGoogleAccessToken(connection);
    const properties = await listProperties(accessToken);

    const refreshed = await prisma.connection.update({
      where: { id: connectionId },
      data: { status: "active" },
    });

    return NextResponse.json({
      ok: true,
      status: refreshed.status,
      propertyCount: properties.length,
      expiresAt: refreshed.expiresAt,
    });
  } catch (error) {
    // getValidGoogleAccessToken already flips status to expired on failure.
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "check failed" },
      { status: 502 },
    );
  }
}

/**
 * Disconnects the account. Bindings cascade, so any site using this connection
 * stops syncing — the UI states that before asking for confirmation.
 *
 * The refresh token is also revoked provider-side on a best-effort basis: a
 * local delete alone would leave a live grant on the Google account with no way
 * to see it from here.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { connectionId } = await params;
  const connection = await loadOwned(connectionId, user.id);
  if (!connection) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let revoked = false;
  if (connection.provider === "GOOGLE" && connection.encRefreshToken) {
    try {
      const refreshToken = decryptSecret(connection.encRefreshToken);
      const res = await fetch(GOOGLE_REVOKE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }),
        signal: AbortSignal.timeout(10_000),
      });
      revoked = res.ok;
    } catch (error) {
      // Network trouble must not strand the local record.
      console.error("[connections] revoke failed", error);
    }
  }

  const affected = await prisma.binding.count({ where: { connectionId } });
  await prisma.connection.delete({ where: { id: connectionId } });

  return NextResponse.json({ ok: true, revoked, unboundSites: affected });
}
