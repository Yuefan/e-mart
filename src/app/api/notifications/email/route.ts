import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { sendEmail, isEmailConfigured } from "@/lib/email/send";
import { verificationEmail } from "@/lib/email/templates";
import {
  issueVerification,
  looksLikeEmail,
  normalizeEmail,
  verificationUrl,
} from "@/lib/email/verification";
import { isLocale } from "@/lib/i18n/config";
import { prisma } from "@/lib/prisma";

/**
 * Starts verification for a reporting address.
 *
 * The address is *not* written to the user here — only into the pending
 * challenge. It takes effect when the emailed link is opened, so a typo never
 * silently becomes the delivery target, and a signed-in user cannot point
 * reports at an inbox that has not agreed to receive them.
 */
export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!isEmailConfigured()) {
    return NextResponse.json({ error: "email_not_configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const raw = typeof body?.email === "string" ? body.email : "";
  const email = normalizeEmail(raw);

  if (!looksLikeEmail(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const { token } = await issueVerification(user.id, email);

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { locale: true },
  });
  const locale = isLocale(record?.locale) ? record.locale : "en";

  try {
    await sendEmail({ to: email, ...verificationEmail(locale, verificationUrl(token)) });
  } catch (error) {
    // The challenge row is left in place: harmless, single-use, and expiring.
    return NextResponse.json(
      { error: "send_failed", detail: error instanceof Error ? error.message : "unknown" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, email });
}

/** Stops reports and forgets the address. */
export async function DELETE() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { notifyEmail: null, notifyEmailVerifiedAt: null },
    }),
    // Any link already in an inbox stops working.
    prisma.emailVerification.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}

/** Toggles reports without discarding the verified address. */
export async function PATCH(request: Request) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { notifyOnAudit: body.enabled },
  });

  return NextResponse.json({ ok: true, enabled: body.enabled });
}
