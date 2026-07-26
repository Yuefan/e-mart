import { NextResponse } from "next/server";
import { consumeVerification } from "@/lib/email/verification";
import { appUrl } from "@/lib/env";

/**
 * Target of the emailed confirmation link.
 *
 * Deliberately unauthenticated: the link is opened in whatever browser the
 * inbox happens to be read in, which is usually not the one holding the
 * session. Possession of a single-use, 24-hour, 256-bit token is the proof —
 * requiring a login as well would strand anyone reading mail on their phone.
 *
 * It redirects into the app rather than answering with JSON, because a person
 * clicked it and a bare JSON body is a dead end.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const result = await consumeVerification(token);

  // Based on appUrl(), never request.url: behind the reverse proxy the request
  // arrives on the container's own address, so request.url is
  // http://0.0.0.0:3000 and the user would be redirected somewhere unreachable.
  const target = new URL("/account", appUrl());
  if (result.ok) {
    target.searchParams.set("verified", result.email);
  } else {
    target.searchParams.set("verify_error", result.reason);
  }

  // 303: the browser must follow with GET, and the result is not cacheable —
  // the token is spent, so replaying this URL would report failure.
  return NextResponse.redirect(target, 303);
}
