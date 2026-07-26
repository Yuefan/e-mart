"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  type SettingsFormState,
  deleteSite,
  renameSite,
} from "@/app/(dash)/sites/[siteId]/settings/actions";
import { fmt } from "@/lib/i18n/format";
import { useT } from "./i18n-provider";
import { buttonClass, inputClass } from "./ui";

function Submit({ label, busy, variant = "secondary" }: {
  label: string;
  busy: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant)}>
      {pending ? busy : label}
    </button>
  );
}

export function RenameSiteForm({ siteId, name }: { siteId: string; name: string }) {
  const t = useT();
  const [state, action] = useActionState<SettingsFormState, FormData>(renameSite, null);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3 px-5 py-4">
      <input type="hidden" name="siteId" value={siteId} />
      <div className="min-w-56 flex-1">
        <label htmlFor="site-name" className="block text-sm font-medium">
          {t.settings.displayName}
        </label>
        <input
          id="site-name"
          name="name"
          defaultValue={name}
          className={inputClass("mt-1.5")}
        />
      </div>
      <Submit label={t.settings.rename} busy={t.settings.renaming} />
      {state ? (
        <p className={state.ok ? "text-sm text-pos" : "text-sm text-neg"}>{state.message}</p>
      ) : null}
    </form>
  );
}

/**
 * Deleting cascades to every GSC row, audit and draft for the site, so the
 * button stays disabled until the name is typed back exactly.
 */
export function DeleteSiteForm({ siteId, name }: { siteId: string; name: string }) {
  const t = useT();
  const [confirmation, setConfirmation] = useState("");
  const matches = confirmation.trim() === name;

  return (
    <form action={deleteSite} className="px-5 py-4">
      <input type="hidden" name="siteId" value={siteId} />
      <p className="text-sm text-muted">{t.settings.deleteNote}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="confirm-name" className="block text-sm font-medium">
            {fmt(t.settings.typeToConfirm, { name })}
          </label>
          <input
            id="confirm-name"
            name="confirmName"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            className={inputClass("mt-1.5")}
          />
        </div>
        <button
          type="submit"
          disabled={!matches}
          className={buttonClass("secondary", "border-neg/40 text-neg disabled:opacity-40")}
        >
          {t.settings.deleteSite}
        </button>
      </div>
    </form>
  );
}
