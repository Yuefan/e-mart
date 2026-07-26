"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  type SettingsFormState,
  saveBrandVoice,
} from "@/app/(dash)/sites/[siteId]/settings/actions";
import { type BrandVoice, EMPTY_BRAND_VOICE } from "@/lib/brand-voice";
import { useT } from "./i18n-provider";
import { Field, buttonClass, inputClass } from "./ui";

function SubmitButton({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass("primary")}>
      {pending ? busy : label}
    </button>
  );
}

export function BrandVoiceForm({
  siteId,
  initial,
}: {
  siteId: string;
  initial: BrandVoice | null;
}) {
  const t = useT();
  const [state, action] = useActionState<SettingsFormState, FormData>(saveBrandVoice, null);
  const voice = initial ?? EMPTY_BRAND_VOICE;

  return (
    <form action={action} className="space-y-4 px-5 py-4">
      <input type="hidden" name="siteId" value={siteId} />

      <Field
        label={t.settings.tone}
        htmlFor="tone"
        hint={t.settings.toneHint}
      >
        <input
          id="tone"
          name="tone"
          defaultValue={voice.tone}
          className={inputClass()}
          placeholder="professional but approachable, engineer-to-engineer"
        />
      </Field>

      <Field label={t.settings.audience} htmlFor="audience" hint={t.settings.audienceHint}>
        <input
          id="audience"
          name="audience"
          defaultValue={voice.audience}
          className={inputClass()}
          placeholder="EU/US procurement managers and hardware engineers"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t.settings.language} htmlFor="language" hint={t.settings.languageHint}>
          <input
            id="language"
            name="language"
            defaultValue={voice.language}
            className={inputClass()}
            placeholder="en-US"
          />
        </Field>
        <Field label={t.settings.minWords} htmlFor="minWords">
          <input
            id="minWords"
            name="minWords"
            type="number"
            min={100}
            defaultValue={voice.wordCountRange[0]}
            className={inputClass("tnum")}
          />
        </Field>
        <Field label={t.settings.maxWords} htmlFor="maxWords">
          <input
            id="maxWords"
            name="maxWords"
            type="number"
            min={100}
            defaultValue={voice.wordCountRange[1]}
            className={inputClass("tnum")}
          />
        </Field>
      </div>

      <Field
        label={t.settings.coreTopics}
        htmlFor="coreTopics"
        hint={t.settings.coreTopicsHint}
      >
        <textarea
          id="coreTopics"
          name="coreTopics"
          rows={2}
          defaultValue={voice.coreTopics.join(", ")}
          className={inputClass("resize-y")}
          placeholder="smart hardware, IoT sensing, ODM manufacturing"
        />
      </Field>

      <Field
        label={t.settings.keywords}
        htmlFor="keywords"
        hint={t.settings.keywordsHint}
      >
        <textarea
          id="keywords"
          name="keywords"
          rows={2}
          defaultValue={voice.keywords.join(", ")}
          className={inputClass("resize-y")}
          placeholder="posture sensor, garden robot, RTK positioning"
        />
      </Field>

      <Field
        label={t.settings.forbidden}
        htmlFor="forbidden"
        hint={t.settings.forbiddenHint}
      >
        <textarea
          id="forbidden"
          name="forbidden"
          rows={2}
          defaultValue={voice.forbidden.join(", ")}
          className={inputClass("resize-y")}
          placeholder="cheap, guaranteed results"
        />
      </Field>

      <Field
        label={t.settings.referenceUrls}
        htmlFor="referenceUrls"
        hint={t.settings.referenceUrlsHint}
      >
        <textarea
          id="referenceUrls"
          name="referenceUrls"
          rows={2}
          defaultValue={voice.referenceUrls.join("\n")}
          className={inputClass("resize-y font-mono text-xs")}
          placeholder="https://example.com/blog/a"
        />
      </Field>

      <Field
        label={t.settings.imageStyle}
        htmlFor="imageStyle"
        hint={t.settings.imageStyleHint}
      >
        <input
          id="imageStyle"
          name="imageStyle"
          defaultValue={voice.imageStyle}
          className={inputClass()}
          placeholder="clean product photography, soft studio lighting, no text overlay"
        />
      </Field>

      <div className="flex items-center gap-3 pt-1">
        <SubmitButton label={t.settings.saveBrandVoice} busy={t.common.saving} />
        {state ? (
          <p className={state.ok ? "text-sm text-pos" : "text-sm text-neg"}>{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}
