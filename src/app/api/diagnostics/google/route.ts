import { NextResponse } from "next/server";
import { isGoogleConfigured } from "@/lib/env";
import { googleRedirectUri } from "@/lib/integrations/google/oauth";

/**
 * Answers the question that costs the most time to debug by hand: can *this
 * process* reach Google? The browser going through a system proxy says nothing
 * about Node, which ignores HTTP_PROXY unless NODE_USE_ENV_PROXY=1 is set
 * before the process starts.
 *
 * Deliberately returns booleans and timings only — no proxy address, no
 * credentials — so it is safe to hit without a session.
 */
export async function GET() {
  const started = Date.now();

  let reachable = false;
  let detail: string | null = null;
  try {
    // Google's discovery document: public, cheap, no credentials involved.
    const res = await fetch("https://accounts.google.com/.well-known/openid-configuration", {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    reachable = res.ok;
    if (!res.ok) detail = `HTTP ${res.status}`;
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
    const cause = (error as { cause?: { code?: string } })?.cause;
    if (cause?.code) detail += ` (${cause.code})`;
  }

  return NextResponse.json({
    reachable,
    elapsedMs: Date.now() - started,
    detail,
    proxy: {
      // Whether a proxy is configured, never where it points.
      configuredInEnv: Boolean(process.env.HTTPS_PROXY || process.env.https_proxy),
      nodeUsesEnvProxy: process.env.NODE_USE_ENV_PROXY === "1",
    },
    oauth: {
      credentialsPresent: isGoogleConfigured(),
      redirectUri: googleRedirectUri(),
    },
  });
}
