import { NextResponse } from "next/server";
import { consumeVerification } from "@/lib/email/verification";

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

  const target = new URL("/account", request.url);
  if (result.ok) {
    target.searchParams.set("verified", result.email);
  } else {
    target.searchParams.set("verify_error", result.reason);
  }

  // 303: the browser must follow with GET, and the result is not cacheable —
  // the token is spent, so replaying this URL would report failure.
  return NextResponse.redirect(target, 303);
}
