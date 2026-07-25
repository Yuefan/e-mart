"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClass } from "./ui";

type State = { kind: "idle" | "syncing" } | { kind: "error"; message: string };

export function SyncButton({
  siteId,
  days = 90,
  label = "Sync from Search Console",
  variant = "secondary",
}: {
  siteId: string;
  days?: number;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
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
      if (!res.ok) throw new Error(body?.error ?? `Sync failed (${res.status})`);

      setState({ kind: "idle" });
      startTransition(() => router.refresh());
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Sync failed",
      });
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={sync} disabled={busy} className={buttonClass(variant)}>
        {busy ? `Syncing ${days} days…` : label}
      </button>
      {state.kind === "error" ? (
        <p className="max-w-xs text-right text-xs text-neg">{state.message}</p>
      ) : null}
    </div>
  );
}
