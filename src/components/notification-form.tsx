"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { useT } from "./i18n-provider";
import { Badge, buttonClass, inputClass } from "./ui";

type Props = {
  configured: boolean;
  initialEmail: string | null;
  verified: boolean;
  enabled: boolean;
  /** Address with a challenge outstanding, if any. */
  pendingEmail: string | null;
};

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "removing" }
  | { kind: "error"; message: string };

export function NotificationForm({
  configured,
  initialEmail,
  verified,
  enabled,
  pendingEmail,
}: Props) {
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState(initialEmail ?? pendingEmail ?? "");
  const [onAudit, setOnAudit] = useState(enabled);
  const [state, setState] = useState<State>({ kind: "idle" });

  const busy = state.kind === "sending" || state.kind === "removing";

  async function submit() {
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/notifications/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message =
          body?.error === "invalid_email"
            ? t.notify.invalidEmail
            : body?.error === "email_not_configured"
              ? t.notify.notConfigured
              : (body?.detail ?? `${res.status}`);
        setState({ kind: "error", message });
        return;
      }

      setState({ kind: "sent", email: body.email });
      router.refresh();
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "failed",
      });
    }
  }

  async function remove() {
    setState({ kind: "removing" });
    try {
      await fetch("/api/notifications/email", { method: "DELETE" });
      setEmail("");
      setState({ kind: "idle" });
      router.refresh();
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "failed",
      });
    }
  }

  async function toggle(next: boolean) {
    // Optimistic: the checkbox should not lag behind the click, and a failure
    // is recoverable by clicking again.
    setOnAudit(next);
    await fetch("/api/notifications/email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    }).catch(() => setOnAudit(!next));
    router.refresh();
  }

  if (!configured) {
    return <p className="px-5 py-4 text-sm text-muted">{t.notify.notConfigured}</p>;
  }

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="notify-email" className="block text-sm font-medium">
            {t.notify.emailLabel}
          </label>
          <input
            id="notify-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t.notify.emailPlaceholder}
            autoComplete="email"
            className={inputClass("mt-1.5")}
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={busy || email.trim().length === 0}
          className={buttonClass("secondary", "disabled:opacity-40")}
        >
          {state.kind === "sending"
            ? t.notify.sending
            : verified || pendingEmail
              ? t.notify.resend
              : t.notify.send}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {verified ? (
          <>
            <Badge tone="positive">{t.notify.verified}</Badge>
            <span className="text-muted">
              {fmt(t.notify.verifiedNote, { email: initialEmail ?? "" })}
            </span>
          </>
        ) : pendingEmail ? (
          <>
            <Badge tone="accent">{t.notify.pending}</Badge>
            <span className="text-muted">{t.notify.pendingNote}</span>
          </>
        ) : null}
      </div>

      {state.kind === "sent" ? (
        <p className="mt-2 text-xs text-pos">{fmt(t.notify.sentTo, { email: state.email })}</p>
      ) : null}
      {state.kind === "error" ? (
        <p className="mt-2 text-xs text-neg">{state.message}</p>
      ) : null}

      {verified ? (
        <div className="mt-4 border-t border-line pt-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onAudit}
              onChange={(event) => void toggle(event.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            {t.notify.onAudit}
          </label>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className={buttonClass("ghost", "mt-2 -ml-2 px-2 text-xs text-neg")}
          >
            {state.kind === "removing" ? t.notify.removing : t.notify.remove}
          </button>
        </div>
      ) : null}
    </div>
  );
}
