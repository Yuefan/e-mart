import { NextResponse } from "next/server";
import { appUrl, isGoogleConfigured } from "@/lib/env";
import {
  buildAuthUrl,
  createPkcePair,
  createStateToken,
} from "@/lib/integrations/google/oauth";
import { stashOAuthState } from "@/lib/session";

export async function GET(request: Request) {
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(`${appUrl()}/login?error=google_not_configured`);
  }

  const returnTo = new URL(request.url).searchParams.get("returnTo") ?? "/connections";
  const state = createStateToken();
  const { codeVerifier, codeChallenge } = createPkcePair();

  // Signed, httpOnly, 10-minute cookie stands in for the Redis store in the spec.
  await stashOAuthState({
    state,
    codeVerifier,
    // Only allow same-app paths back, never an absolute URL.
    returnTo: returnTo.startsWith("/") ? returnTo : "/connections",
  });

  return NextResponse.redirect(buildAuthUrl({ state, codeChallenge }));
}
