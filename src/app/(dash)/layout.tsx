import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { Brand } from "@/components/brand";
import { SidebarNav } from "@/components/sidebar-nav";
import { TopBar } from "@/components/top-bar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const { t } = await getT();

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
          <Link href="/" className="block transition-opacity hover:opacity-80">
            <Brand size="md" />
          </Link>
          <p className="mt-1 text-xs text-muted">{t.common.subtitle}</p>
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
