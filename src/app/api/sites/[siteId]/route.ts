import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ siteId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { siteId } = await params;
  const site = await prisma.site.findFirst({ where: { id: siteId, userId: user.id } });
  if (!site) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Bindings, GscDaily and JobRuns cascade.
  await prisma.site.delete({ where: { id: siteId } });
  return NextResponse.json({ ok: true });
}
