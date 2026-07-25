import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SidebarNav } from "@/components/sidebar-nav";
import { TopBar } from "@/components/top-bar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  const [sites, connections] = await Promise.all([
    prisma.site.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, domain: true },
    }),
    prisma.connection.findMany({
      where: { userId: user.id },
      select: { status: true },
    }),
  ]);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-panel md:flex">
        <div className="border-b border-line px-5 py-4">
          <Link href="/" className="text-sm font-semibold">
            AI Marketing
          </Link>
          <p className="mt-0.5 text-xs text-muted">Dashboard</p>
        </div>

        <SidebarNav sites={sites} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          user={{ name: user.name, email: user.email, image: user.image }}
          connectionCount={connections.length}
          needsAttention={connections.filter((c) => c.status !== "active").length}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
