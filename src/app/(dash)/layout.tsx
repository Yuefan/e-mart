import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SidebarNav } from "@/components/sidebar-nav";
import { buttonClass } from "@/components/ui";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  const sites = await prisma.site.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, domain: true },
  });

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

        <div className="mt-auto border-t border-line px-5 py-3">
          <p className="truncate text-xs font-medium">{user.name ?? user.email}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
          <form action="/api/auth/logout" method="post" className="mt-2">
            <button type="submit" className={buttonClass("ghost", "-ml-2 px-2 py-1 text-xs")}>
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
