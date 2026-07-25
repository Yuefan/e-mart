"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { GoogleConnectButton } from "./google-connect-button";
import { Badge, buttonClass, inputClass } from "./ui";

export type ConnectionView = {
  id: string;
  provider: string;
  accountLabel: string;
  status: string;
  scopes: string[];
  expiresAt: string | null;
  hasRefreshToken: boolean;
  connectedAt: string;
  updatedAt: string;
  /** Sites currently bound through this connection. */
  boundSites: { id: string; name: string; resourceId: string }[];
};

type ActionState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "checked"; message: string; ok: boolean }
  | { kind: "removing" }
  | { kind: "error"; message: string };

/** "expires in 43 minutes" / "expired 2 hours ago" */
function relativeTime(iso: string | null): string {
  if (!iso) return "unknown";
  const deltaMs = new Date(iso).getTime() - Date.now();
  const minutes = Math.round(Math.abs(deltaMs) / 60_000);
  const label =
    minutes < 60
      ? `${minutes} minute${minutes === 1 ? "" : "s"}`
      : minutes < 60 * 48
        ? `${Math.round(minutes / 60)} hour${Math.round(minutes / 60) === 1 ? "" : "s"}`
        : `${Math.round(minutes / 1440)} days`;
  return deltaMs >= 0 ? `in ${label}` : `${label} ago`;
}

/** `https://www.googleapis.com/auth/webmasters.readonly` -> `webmasters.readonly` */
function shortScope(scope: string): string {
  return scope.startsWith("https://") ? scope.split("/auth/")[1] ?? scope : scope;
}

export function ConnectionCard({ connection }: { connection: ConnectionView }) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>({ kind: "idle" });
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const busy = state.kind === "checking" || state.kind === "removing";
  const expired = connection.status !== "active";

  async function check() {
    setState({ kind: "checking" });
    try {
      const res = await fetch(`/api/connections/${connection.id}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body?.error ?? `Check failed (${res.status})`);
      setState({
        kind: "checked",
        ok: true,
        message: `Working — ${body.propertyCount} propert${body.propertyCount === 1 ? "y" : "ies"} visible.`,
      });
      router.refresh();
    } catch (error) {
      setState({
        kind: "checked",
        ok: false,
        message: error instanceof Error ? error.message : "Check failed",
      });
      router.refresh();
    }
  }

  async function disconnect() {
    setState({ kind: "removing" });
    try {
      const res = await fetch(`/api/connections/${connection.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Disconnect failed (${res.status})`);
      router.refresh();
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Disconnect failed",
      });
    }
  }

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{connection.accountLabel}</p>
            <Badge tone={expired ? "negative" : "positive"}>{connection.status}</Badge>
            {!connection.hasRefreshToken ? (
              <Badge tone="negative">no refresh token</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted">
            Connected {connection.connectedAt.slice(0, 10)} · access token{" "}
            {expired ? "invalid" : `expires ${relativeTime(connection.expiresAt)}`}
            {connection.hasRefreshToken ? " (auto-renewed)" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={check}
            disabled={busy}
            className={buttonClass("secondary", "text-xs")}
          >
            {state.kind === "checking" ? "Checking…" : "Test"}
          </button>
          <GoogleConnectButton
            returnTo="/account"
            label="Re-authorize"
            variant={expired ? "primary" : "secondary"}
            className="text-xs"
          />
        </div>
      </div>

      {state.kind === "checked" ? (
        <p className={cn("mt-2 text-xs", state.ok ? "text-pos" : "text-neg")}>{state.message}</p>
      ) : null}
      {state.kind === "error" ? (
        <p className="mt-2 text-xs text-neg">{state.message}</p>
      ) : null}

      <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted">Permissions granted</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {connection.scopes.length === 0 ? (
              <span className="text-muted">none recorded</span>
            ) : (
              connection.scopes.map((scope) => (
                <span
                  key={scope}
                  title={scope}
                  className="rounded bg-panel-alt px-1.5 py-0.5 font-mono text-[11px]"
                >
                  {shortScope(scope)}
                </span>
              ))
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Sites using this account</dt>
          <dd className="mt-1">
            {connection.boundSites.length === 0 ? (
              <span className="text-muted">none yet</span>
            ) : (
              <ul className="space-y-0.5">
                {connection.boundSites.map((site) => (
                  <li key={site.id} className="truncate">
                    {site.name}{" "}
                    <span className="font-mono text-muted">{site.resourceId}</span>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-line pt-3">
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={buttonClass("ghost", "-ml-2 px-2 text-xs text-neg")}
          >
            Disconnect
          </button>
        ) : (
          <div>
            <p className="text-xs text-muted">
              Revokes the grant on Google and removes it here.{" "}
              {connection.boundSites.length > 0 ? (
                <span className="text-neg">
                  {connection.boundSites.length} site
                  {connection.boundSites.length === 1 ? "" : "s"} will stop syncing.
                </span>
              ) : null}{" "}
              Stored Search Console data is kept.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder="type DISCONNECT"
                autoComplete="off"
                className={inputClass("w-48 py-1.5 text-xs")}
                aria-label="Type DISCONNECT to confirm"
              />
              <button
                type="button"
                disabled={confirmText.trim() !== "DISCONNECT" || busy}
                onClick={disconnect}
                className={buttonClass(
                  "secondary",
                  "border-neg/40 text-xs text-neg disabled:opacity-40",
                )}
              >
                {state.kind === "removing" ? "Disconnecting…" : "Confirm disconnect"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setConfirmText("");
                }}
                className={buttonClass("ghost", "text-xs")}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
