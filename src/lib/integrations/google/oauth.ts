import { createHash, randomBytes } from "node:crypto";
import type { Connection } from "@prisma/client";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { appUrl, requireEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

/** Identity (to create the app account) + read-only Search Console. */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

export function googleRedirectUri(): string {
  return `${appUrl()}/api/connections/google/callback`;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function createPkcePair() {
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

export function createStateToken(): string {
  return base64url(randomBytes(32));
}

export function buildAuthUrl(params: { state: string; codeChallenge: string }): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", requireEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  // offline + consent is what actually yields a refresh_token on repeat grants
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  id_token?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.error_description || json?.error || res.statusText;
    throw new Error(`Google token endpoint failed (${res.status}): ${detail}`);
  }
  return json as TokenResponse;
}

export function exchangeCodeForTokens(code: string, codeVerifier: string) {
  return postToken({
    code,
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });
}

export function refreshAccessToken(refreshToken: string) {
  return postToken({
    refresh_token: refreshToken,
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
}

export async function fetchGoogleUserInfo(accessToken: string) {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google userinfo failed (${res.status})`);
  return (await res.json()) as {
    sub: string;
    email: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Returns a usable access token for a stored Connection, refreshing and
 * persisting it when it is within 5 minutes of expiry (per spec §4.1).
 */
export async function getValidGoogleAccessToken(connection: Connection): Promise<string> {
  const expiresAt = connection.expiresAt?.getTime() ?? 0;
  const stillFresh = expiresAt - Date.now() > REFRESH_MARGIN_MS;

  if (stillFresh) return decryptSecret(connection.encAccessToken);

  return refreshGoogleConnection(connection);
}

/**
 * Refresh unconditionally and persist. Used both as the fallback above and by
 * the scheduled tokenRefresh job, which renews anything expiring within an hour
 * so a sync never has to stop and refresh mid-run.
 */
export async function refreshGoogleConnection(connection: Connection): Promise<string> {
  if (!connection.encRefreshToken) {
    await markConnectionExpired(connection.id);
    throw new Error(
      "Google access token expired and no refresh token is stored — reconnect the account.",
    );
  }

  try {
    const refreshToken = decryptSecret(connection.encRefreshToken);
    const tokens = await refreshAccessToken(refreshToken);

    await prisma.connection.update({
      where: { id: connection.id },
      data: {
        encAccessToken: encryptSecret(tokens.access_token),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        // Google usually omits refresh_token on refresh; keep the old one.
        ...(tokens.refresh_token
          ? { encRefreshToken: encryptSecret(tokens.refresh_token) }
          : {}),
        status: "active",
      },
    });
    return tokens.access_token;
  } catch (error) {
    await markConnectionExpired(connection.id);
    throw error;
  }
}

async function markConnectionExpired(connectionId: string) {
  await prisma.connection.update({
    where: { id: connectionId },
    data: { status: "expired" },
  });
}
