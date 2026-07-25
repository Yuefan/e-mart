"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { BoundProperty } from "@/lib/integrations/google/properties";
import { Badge, EmptyState, buttonClass } from "./ui";

const BACKFILL_DAYS = 90;

/**
 * Properties are fetched on the server and passed in; this component only owns
 * the "add as site" action and its two follow-up requests.
 */
export function PropertyPicker({
  accountLabel,
  properties,
  error,
}: {
  accountLabel: string;
  properties: BoundProperty[];
  error?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isRefreshing, startTransition] = useTransition();

  if (error) {
    return (
      <EmptyState
        title="Could not read your Search Console properties"
        description={error}
        action={
          <button
            type="button"
            onClick={() => startTransition(() => router.refresh())}
            disabled={isRefreshing}
            className={buttonClass("secondary")}
          >
            {isRefreshing ? "Retrying…" : "Try again"}
          </button>
        }
      />
    );
  }

  if (properties.length === 0) {
    return (
      <EmptyState
        title="No properties on this Google account"
        description={`${accountLabel} has no verified Search Console properties. Verify a site in Search Console first, then reload this page.`}
      />
    );
  }

  async function addSite(property: BoundProperty) {
    setBusy(property.siteUrl);
    setActionError(null);
    try {
      const created = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl: property.siteUrl, name: property.domain }),
      });
      const body = await created.json();
      if (!created.ok) throw new Error(body?.error ?? "Could not create the site");

      const siteId: string = body.site.id;

      // Backfill immediately so the overview isn't an empty page.
      const synced = await fetch(`/api/sites/${siteId}/gsc/sync?days=${BACKFILL_DAYS}`, {
        method: "POST",
      });
      if (!synced.ok) {
        const detail = await synced.json().catch(() => ({}));
        throw new Error(detail?.error ?? "Site created, but the first sync failed");
      }

      router.push(`/sites/${siteId}/overview`);
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  }

  return (
    <div>
      {actionError ? <p className="px-5 pt-3 text-sm text-neg">{actionError}</p> : null}
      <ul className="divide-y divide-line/60">
        {properties.map((property) => (
          <li key={property.siteUrl} className="flex items-center gap-4 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{property.domain}</p>
              <p className="truncate font-mono text-xs text-muted">{property.siteUrl}</p>
            </div>

            <Badge tone="neutral">{property.permissionLevel.replace("site", "")}</Badge>

            {property.siteId ? (
              <Link
                href={`/sites/${property.siteId}/overview`}
                className={buttonClass("secondary")}
              >
                Open
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => addSite(property)}
                disabled={busy !== null}
                className={buttonClass("primary")}
              >
                {busy === property.siteUrl ? "Adding + syncing…" : "Add as site"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
