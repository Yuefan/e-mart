import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Entry point: send people wherever they can actually do something. */
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const site = await prisma.site.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  redirect(site ? `/sites/${site.id}/overview` : "/connections");
}
