import { NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import {
  GOOGLE_SCOPES,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
} from "@/lib/integrations/google/oauth";
import { prisma } from "@/lib/prisma";
import { consumeOAuthState, createSession, getSessionUserId } from "@/lib/session";

function fail(reason: string, detail?: string) {
  const url = new URL(`${appUrl()}/login`);
  url.searchParams.set("error", reason);
  // Google's error_description and Node's connect errors are both safe to show:
  // neither echoes back the request body, so no secret can leak this way.
  if (detail) url.searchParams.set("detail", detail.slice(0, 300));
  return NextResponse.redirect(url.toString());
}

/** Node couldn't reach Google at all, as opposed to Google rejecting us. */
function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause = (error as { cause?: { code?: string } }).cause;
  return (
    error.message.includes("fetch failed") ||
    Boolean(cause?.code?.startsWith("UND_ERR")) ||
    Boolean(cause?.code && ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT"].includes(cause.code))
  );
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const oauthError = params.get("error");
  if (oauthError) return fail(oauthError); // user clicked "Cancel"

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return fail("missing_code");

  const stashed = await consumeOAuthState();
  if (!stashed || stashed.state !== state) return fail("state_mismatch");

  try {
    const tokens = await exchangeCodeForTokens(code, stashed.codeVerifier);
    const profile = await fetchGoogleUserInfo(tokens.access_token);

    const grantedScopes = tokens.scope?.split(" ") ?? GOOGLE_SCOPES;
    if (!grantedScopes.some((s) => s.includes("webmasters"))) {
      return fail("search_console_scope_declined");
    }

    // Two different flows share this callback, told apart by whether a session
    // already exists:
    //
    //   signed out -> this is a sign-in. Google identity becomes the app
    //                 account (there is no separate password).
    //   signed in  -> this is "add another Google account". The credential is
    //                 attached to the *current* user and the session is left
    //                 alone. Upserting a user here instead would silently
    //                 switch workspaces and hide the first account's sites.
    const signedInUserId = await getSessionUserId();
    const currentUser = signedInUserId
      ? await prisma.user.findUnique({ where: { id: signedInUserId } })
      : null;

    let userId: string;
    if (currentUser) {
      userId = currentUser.id;
    } else {
      const user = await prisma.user.upsert({
        where: { email: profile.email },
        create: {
          email: profile.email,
          name: profile.name ?? null,
          image: profile.picture ?? null,
        },
        update: { name: profile.name ?? null, image: profile.picture ?? null },
      });
      userId = user.id;
      await createSession(user.id);
    }

    const encAccessToken = encryptSecret(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const encRefreshToken = tokens.refresh_token
      ? encryptSecret(tokens.refresh_token)
      : undefined;

    await prisma.connection.upsert({
      where: {
        userId_provider_accountLabel: {
          userId,
          provider: "GOOGLE",
          accountLabel: profile.email,
        },
      },
      create: {
        userId,
        provider: "GOOGLE",
        accountLabel: profile.email,
        encAccessToken,
        encRefreshToken,
        expiresAt,
        scopes: grantedScopes,
        meta: { sub: profile.sub },
        status: "active",
      },
      update: {
        encAccessToken,
        expiresAt,
        scopes: grantedScopes,
        status: "active",
        // Google omits refresh_token when the user has already consented;
        // never overwrite a good one with undefined.
        ...(encRefreshToken ? { encRefreshToken } : {}),
      },
    });

    return NextResponse.redirect(`${appUrl()}${stashed.returnTo}`);
  } catch (error) {
    console.error("[google/callback]", error);
    const message = error instanceof Error ? error.message : String(error);
    return isNetworkError(error)
      ? fail("google_unreachable", message)
      : fail("token_exchange_failed", message);
  }
}
