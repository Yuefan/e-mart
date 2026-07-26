"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fmt } from "@/lib/i18n/format";
import { useT } from "./i18n-provider";
import { buttonClass } from "./ui";

type State = { kind: "idle" | "syncing" } | { kind: "error"; message: string };

export function SyncButton({
  siteId,
  days = 90,
  label,
  variant = "secondary",
}: {
  siteId: string;
  days?: number;
  /** Defaults to the full "sync from Search Console" wording for the locale. */
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const t = useT();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [isRefreshing, startTransition] = useTransition();

  const busy = state.kind === "syncing" || isRefreshing;

  async function sync() {
    setState({ kind: "syncing" });
    try {
      const res = await fetch(`/api/sites/${siteId}/gsc/sync?days=${days}`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `${t.overview.syncFailed} (${res.status})`);

      setState({ kind: "idle" });
      startTransition(() => router.refresh());
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : t.overview.syncFailed,
      });
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={sync} disabled={busy} className={buttonClass(variant)}>
        {busy ? fmt(t.overview.syncing, { days }) : (label ?? t.overview.syncFull)}
      </button>
      {state.kind === "error" ? (
        <p className="max-w-xs text-right text-xs text-neg">{state.message}</p>
      ) : null}
    </div>
  );
}
