"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "./i18n-provider";
import { SiteIcon } from "./site-icon";

type Site = { id: string; name: string; domain: string };

/** Segments are routes, so they stay literal; only the label is translated. */
const MODULE_SEGMENTS = ["overview", "seo", "content", "settings"] as const;

/** Modules from the spec that aren't built yet. */
const PLANNED_SEGMENTS = ["deploy"] as const;

export function SidebarNav({ sites }: { sites: Site[] }) {
  const pathname = usePathname();
  const t = useT();
  const moduleLabels: Record<(typeof MODULE_SEGMENTS)[number], string> = {
    overview: t.nav.searchPerformance,
    seo: t.nav.seoAudit,
    content: t.nav.content,
    settings: t.nav.settings,
  };
  const plannedLabels: Record<(typeof PLANNED_SEGMENTS)[number], string> = {
    deploy: t.nav.deploy,
  };
  const activeSiteId = pathname.match(/^\/sites\/([^/]+)/)?.[1];

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      <p className="px-2 text-xs font-medium tracking-wide text-muted uppercase">{t.nav.sites}</p>
      <ul className="mt-2 space-y-0.5">
        {sites.length === 0 ? (
          <li className="px-2 py-1.5 text-xs text-muted">{t.common.none}</li>
        ) : (
          sites.map((site) => {
            const active = site.id === activeSiteId;
            return (
              <li key={site.id}>
                <Link
                  href={`/sites/${site.id}/overview`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                    active ? "bg-accent-soft font-medium text-accent" : "hover:bg-panel-alt",
                  )}
                >
                  <SiteIcon domain={site.domain} name={site.name} active={active} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{site.name}</span>
                    <span className="block truncate text-xs font-normal text-muted">
                      {site.domain}
                    </span>
                  </span>
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
            {MODULE_SEGMENTS.map((segment) => {
              const active = pathname.endsWith(`/${segment}`);
              return (
                <li key={segment}>
                  <Link
                    href={`/sites/${activeSiteId}/${segment}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-lg px-2 py-1.5 text-sm transition-colors",
                      active ? "bg-panel-alt font-medium" : "hover:bg-panel-alt",
                    )}
                  >
                    {moduleLabels[segment]}
                  </Link>
                </li>
              );
            })}
            {PLANNED_SEGMENTS.map((segment) => (
              <li
                key={segment}
                title={t.nav.plannedHint}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-muted/60"
              >
                {plannedLabels[segment]}
                <span className="text-[10px] tracking-wide uppercase">{t.common.soon}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="mt-6 px-2 text-xs font-medium tracking-wide text-muted uppercase">
        {t.nav.workspace}
      </p>
      <ul className="mt-2 space-y-0.5">
        {[
          { href: "/account", label: t.nav.account },
          { href: "/connections", label: t.nav.connections },
        ].map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={cn(
                "block rounded-lg px-2 py-1.5 text-sm transition-colors",
                pathname === item.href ? "bg-panel-alt font-medium" : "hover:bg-panel-alt",
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
