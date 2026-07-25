import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import { parseBrandVoice } from "@/lib/brand-voice";
import { countWords, runMechanicalChecks } from "@/lib/content/checks";
import { asRecord } from "@/lib/json";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ articleId: string }> };

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  bodyMd: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDesc: z.string().optional(),
  excerpt: z.string().optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase and hyphenated")
    .optional(),
  targetKeyword: z.string().optional(),
  status: z.enum(["draft", "review", "scheduled", "published", "failed"]).optional(),
});

async function loadOwned(articleId: string, userId: string) {
  return prisma.article.findFirst({
    where: { id: articleId, site: { userId } },
    include: { site: true },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { articleId } = await params;
  const article = await loadOwned(articleId, user.id);
  if (!article) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid_body" },
      { status: 400 },
    );
  }

  if (parsed.data.slug && parsed.data.slug !== article.slug) {
    const clash = await prisma.article.findUnique({
      where: { siteId_slug: { siteId: article.siteId, slug: parsed.data.slug } },
      select: { id: true },
    });
    if (clash) return NextResponse.json({ error: "slug_taken" }, { status: 409 });
  }

  const updated = await prisma.article.update({
    where: { id: articleId },
    data: parsed.data,
  });

  // Re-run the deterministic checks so the stored verdict matches the saved text.
  const voice = parseBrandVoice(article.site.brandVoice);
  const issues = runMechanicalChecks({
    bodyMd: updated.bodyMd,
    metaTitle: updated.metaTitle ?? "",
    metaDesc: updated.metaDesc ?? "",
    slug: updated.slug,
    targetKeyword: updated.targetKeyword ?? "",
    forbidden: voice?.forbidden ?? [],
    wordCountRange: voice?.wordCountRange ?? [1200, 1800],
    siteDomain: article.site.domain,
  });

  // Preserve whatever the generation run recorded (unsupportedClaims, reviewed)
  // and replace only the mechanical verdict.
  await prisma.article.update({
    where: { id: articleId },
    data: { checks: { ...(asRecord(updated.checks) ?? {}), issues } },
  });

  return NextResponse.json({
    ok: true,
    wordCount: countWords(updated.bodyMd),
    issues,
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { articleId } = await params;
  const article = await loadOwned(articleId, user.id);
  if (!article) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.article.delete({ where: { id: articleId } });
  return NextResponse.json({ ok: true });
}
