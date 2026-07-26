"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { fmt } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import { GoogleConnectButton } from "./google-connect-button";
import { useT } from "./i18n-provider";
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

/**
 * "in 43 minutes" / "2 hours ago", in the active language.
 *
 * The span and the direction are separate dictionary entries because word order
 * differs: English wraps the span ("in 3 days"), Chinese suffixes it ("3 天后").
 */
function relativeTime(iso: string | null, t: Dictionary): string {
  if (!iso) return t.account.unknownTime;

  const deltaMs = new Date(iso).getTime() - Date.now();
  const minutes = Math.round(Math.abs(deltaMs) / 60_000);

  let span: string;
  if (minutes < 60) {
    span = fmt(t.account.rel.minutes, { n: minutes }, minutes);
  } else if (minutes < 60 * 48) {
    const hours = Math.round(minutes / 60);
    span = fmt(t.account.rel.hours, { n: hours }, hours);
  } else {
    const days = Math.round(minutes / 1440);
    span = fmt(t.account.rel.days, { n: days }, days);
  }

  return fmt(deltaMs >= 0 ? t.account.rel.future : t.account.rel.past, { span });
}

/** `https://www.googleapis.com/auth/webmasters.readonly` -> `webmasters.readonly` */
function shortScope(scope: string): string {
  return scope.startsWith("https://") ? scope.split("/auth/")[1] ?? scope : scope;
}

export function ConnectionCard({ connection }: { connection: ConnectionView }) {
  const router = useRouter();
  const t = useT();
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
      if (!res.ok || !body.ok) {
        throw new Error(body?.error ?? `${t.account.checkFailed} (${res.status})`);
      }
      setState({
        kind: "checked",
        ok: true,
        message: fmt(
          t.account.checkOk,
          { n: body.propertyCount },
          body.propertyCount,
        ),
      });
      router.refresh();
    } catch (error) {
      setState({
        kind: "checked",
        ok: false,
        message: error instanceof Error ? error.message : t.account.checkFailed,
      });
      router.refresh();
    }
  }

  async function disconnect() {
    setState({ kind: "removing" });
    try {
      const res = await fetch(`/api/connections/${connection.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error ?? `${t.account.disconnectFailed} (${res.status})`);
      }
      router.refresh();
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : t.account.disconnectFailed,
      });
    }
  }

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{connection.accountLabel}</p>
            <Badge tone={expired ? "negative" : "positive"}>
              {t.account.statuses[connection.status as keyof typeof t.account.statuses] ??
                connection.status}
            </Badge>
            {!connection.hasRefreshToken ? (
              <Badge tone="negative">{t.account.noRefreshToken}</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted">
            {fmt(t.account.connectedOn, { date: connection.connectedAt.slice(0, 10) })} ·{" "}
            {expired
              ? t.account.tokenInvalid
              : fmt(t.account.tokenExpires, {
                  rel: relativeTime(connection.expiresAt, t),
                })}
            {connection.hasRefreshToken ? t.account.autoRenewed : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={check}
            disabled={busy}
            className={buttonClass("secondary", "text-xs")}
          >
            {state.kind === "checking" ? t.account.checking : t.account.test}
          </button>
          <GoogleConnectButton
            returnTo="/account"
            label={t.account.reauthorize}
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
          <dt className="text-muted">{t.account.permissionsGranted}</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {connection.scopes.length === 0 ? (
              <span className="text-muted">{t.account.noneRecorded}</span>
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
          <dt className="text-muted">{t.account.sitesUsing}</dt>
          <dd className="mt-1">
            {connection.boundSites.length === 0 ? (
              <span className="text-muted">{t.account.noneYet}</span>
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
            {t.account.disconnect}
          </button>
        ) : (
          <div>
            <p className="text-xs text-muted">
              {t.account.disconnectWarning}{" "}
              {connection.boundSites.length > 0 ? (
                <span className="text-neg">
                  {fmt(
                    t.account.disconnectSites,
                    { n: connection.boundSites.length },
                    connection.boundSites.length,
                  )}
                </span>
              ) : null}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={t.account.typeToConfirm}
                autoComplete="off"
                className={inputClass("w-48 py-1.5 text-xs")}
                aria-label={t.account.typeToConfirm}
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
                {state.kind === "removing"
                  ? t.account.disconnecting
                  : t.account.confirmDisconnect}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setConfirmText("");
                }}
                className={buttonClass("ghost", "text-xs")}
              >
                {t.common.cancel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
