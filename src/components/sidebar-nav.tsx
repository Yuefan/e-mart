"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Site = { id: string; name: string; domain: string };

const MODULES = [
  { label: "Search performance", segment: "overview" },
  { label: "SEO audit", segment: "seo" },
  { label: "Content", segment: "content" },
  { label: "Settings", segment: "settings" },
];

/** Modules from the spec that aren't built yet. */
const PLANNED_MODULES = [{ label: "Deploy", segment: "deploy" }];

export function SidebarNav({ sites }: { sites: Site[] }) {
  const pathname = usePathname();
  const activeSiteId = pathname.match(/^\/sites\/([^/]+)/)?.[1];

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      <p className="px-2 text-xs font-medium tracking-wide text-muted uppercase">Sites</p>
      <ul className="mt-2 space-y-0.5">
        {sites.length === 0 ? (
          <li className="px-2 py-1.5 text-xs text-muted">None yet</li>
        ) : (
          sites.map((site) => {
            const active = site.id === activeSiteId;
            return (
              <li key={site.id}>
                <Link
                  href={`/sites/${site.id}/overview`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block truncate rounded-lg px-2 py-1.5 text-sm transition-colors",
                    active ? "bg-accent-soft font-medium text-accent" : "hover:bg-panel-alt",
                  )}
                >
                  {site.name}
                  <span className="block truncate text-xs text-muted">{site.domain}</span>
                </Link>
              </li>
            );
          })
        )}
      </ul>

      {activeSiteId ? (
        <>
          <p className="mt-6 px-2 text-xs font-medium tracking-wide text-muted uppercase">
            Modules
          </p>
          <ul className="mt-2 space-y-0.5">
            {MODULES.map((module) => {
              const active = pathname.endsWith(`/${module.segment}`);
              return (
                <li key={module.segment}>
                  <Link
                    href={`/sites/${activeSiteId}/${module.segment}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-lg px-2 py-1.5 text-sm transition-colors",
                      active ? "bg-panel-alt font-medium" : "hover:bg-panel-alt",
                    )}
                  >
                    {module.label}
                  </Link>
                </li>
              );
            })}
            {PLANNED_MODULES.map((module) => (
              <li
                key={module.segment}
                title="Not built yet — see the spec"
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-muted/60"
              >
                {module.label}
                <span className="text-[10px] tracking-wide uppercase">soon</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="mt-6 px-2 text-xs font-medium tracking-wide text-muted uppercase">
        Workspace
      </p>
      <ul className="mt-2 space-y-0.5">
        <li>
          <Link
            href="/connections"
            aria-current={pathname === "/connections" ? "page" : undefined}
            className={cn(
              "block rounded-lg px-2 py-1.5 text-sm transition-colors",
              pathname === "/connections" ? "bg-panel-alt font-medium" : "hover:bg-panel-alt",
            )}
          >
            Connections
          </Link>
        </li>
      </ul>
    </nav>
  );
}
