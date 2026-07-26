import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { appUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";

/**
 * Email ownership challenges.
 *
 * The rule this exists to enforce: nothing is ever sent to an address that has
 * not opened its own verification link. Without that, anyone signed in could
 * point reports at a stranger's inbox and the app becomes a way to mail people
 * who never asked.
 */

const TOKEN_BYTES = 32;
const TTL_MS = 24 * 60 * 60 * 1000;

/** Tokens are stored hashed, so a database leak yields no working links. */
function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * RFC 5322 in full is not worth implementing; this rejects the shapes that are
 * obviously wrong and lets the verification email be the real test — an address
 * that cannot receive mail never gets verified.
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value) && value.length <= 254;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export type IssuedVerification = { token: string; email: string; expiresAt: Date };

/**
 * Starts a challenge for `email`.
 *
 * Any earlier pending challenge for this user is consumed first, so a link sent
 * to a mistyped address stops working the moment a corrected one is requested.
 */
export async function issueVerification(
  userId: string,
  email: string,
): Promise<IssuedVerification> {
  const normalized = normalizeEmail(email);
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);

  await prisma.$transaction([
    prisma.emailVerification.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.emailVerification.create({
      data: { userId, email: normalized, tokenHash: hash(token), expiresAt },
    }),
  ]);

  return { token, email: normalized, expiresAt };
}

export function verificationUrl(token: string): string {
  return `${appUrl()}/api/notifications/email/verify?token=${encodeURIComponent(token)}`;
}

export type VerifyOutcome =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Consumes a token and, on success, writes the address onto the user.
 *
 * The address is copied from the challenge row rather than taken from the
 * request, so what gets verified is exactly what was mailed.
 */
export async function consumeVerification(token: string): Promise<VerifyOutcome> {
  if (!token) return { ok: false, reason: "invalid" };

  const candidate = hash(token);
  const record = await prisma.emailVerification.findUnique({
    where: { tokenHash: candidate },
  });
  if (!record) return { ok: false, reason: "invalid" };

  // The lookup above already matched on the hash; this compares the two hashes
  // in constant time so the code does not depend on the index's timing
  // behaviour to avoid leaking whether a prefix was correct.
  const a = Buffer.from(candidate);
  const b = Buffer.from(record.tokenHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid" };
  }

  if (record.consumedAt) return { ok: false, reason: "used" };
  if (record.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

  await prisma.$transaction([
    prisma.emailVerification.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { notifyEmail: record.email, notifyEmailVerifiedAt: new Date() },
    }),
  ]);

  return { ok: true, email: record.email };
}
