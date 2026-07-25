import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import { propertyToDomain } from "@/lib/integrations/google/gsc";
import { prisma } from "@/lib/prisma";

const createSiteSchema = z.object({
  /** A GSC property id: `sc-domain:example.com` or `https://example.com/`. */
  siteUrl: z.string().min(1),
  name: z.string().min(1).optional(),
});

/** Bind a Search Console property to a new Site. */
export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = createSiteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { siteUrl } = parsed.data;

  const connection = await prisma.connection.findFirst({
    where: { userId: user.id, provider: "GOOGLE" },
  });
  if (!connection) {
    return NextResponse.json({ error: "no_google_connection" }, { status: 400 });
  }

  const domain = propertyToDomain(siteUrl);

  const existing = await prisma.site.findUnique({
    where: { userId_domain: { userId: user.id, domain } },
    include: { bindings: true },
  });

  if (existing) {
    // Idempotent: re-binding the same property just returns the site.
    const alreadyBound = existing.bindings.some(
      (b) => b.connectionId === connection.id && b.resourceId === siteUrl,
    );
    if (!alreadyBound) {
      await prisma.binding.create({
        data: { siteId: existing.id, connectionId: connection.id, resourceId: siteUrl },
      });
    }
    return NextResponse.json({ site: { id: existing.id, name: existing.name, domain } });
  }

  const site = await prisma.site.create({
    data: {
      userId: user.id,
      name: parsed.data.name ?? domain,
      domain,
      bindings: {
        create: { connectionId: connection.id, resourceId: siteUrl },
      },
    },
  });

  return NextResponse.json(
    { site: { id: site.id, name: site.name, domain: site.domain } },
    { status: 201 },
  );
}
