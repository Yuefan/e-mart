import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { requireEnv } from "./env";

const SESSION_COOKIE = "amd_session";
const SESSION_TTL_HOURS = 24;

function secret(): Uint8Array {
  return new TextEncoder().encode(requireEnv("SESSION_SECRET"));
}

const baseCookie = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_HOURS}h`)
    .sign(secret());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    ...baseCookie,
    maxAge: SESSION_TTL_HOURS * 60 * 60,
  });
}

export async function getSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null; // expired or tampered
  }
}

export type SessionInfo = {
  userId: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
};

/** Session timing for the account page — when you signed in and when it lapses. */
export async function getSessionInfo(): Promise<SessionInfo | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== "string") return null;
    return {
      userId: payload.sub,
      issuedAt: payload.iat ? new Date(payload.iat * 1000) : null,
      expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
    };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

// ---- short-lived OAuth state (replaces the Redis-backed store in the spec) ----

const OAUTH_COOKIE = "amd_oauth";
const OAUTH_TTL_SECONDS = 10 * 60;

export type OAuthState = {
  state: string;
  codeVerifier: string;
  /** Where to send the user once the callback finishes. */
  returnTo: string;
};

export async function stashOAuthState(data: OAuthState): Promise<void> {
  const token = await new SignJWT({ ...data })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${OAUTH_TTL_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(OAUTH_COOKIE, token, { ...baseCookie, maxAge: OAUTH_TTL_SECONDS });
}

/** Reads and clears the stashed state — single use, as the spec requires. */
export async function consumeOAuthState(): Promise<OAuthState | null> {
  const store = await cookies();
  const token = store.get(OAUTH_COOKIE)?.value;
  store.delete(OAUTH_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      state: String(payload.state),
      codeVerifier: String(payload.codeVerifier),
      returnTo: String(payload.returnTo ?? "/connections"),
    };
  } catch {
    return null;
  }
}
