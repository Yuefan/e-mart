"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  type SettingsFormState,
  saveBrandVoice,
} from "@/app/(dash)/sites/[siteId]/settings/actions";
import { type BrandVoice, EMPTY_BRAND_VOICE } from "@/lib/brand-voice";
import { Field, buttonClass, inputClass } from "./ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass("primary")}>
      {pending ? "Saving…" : "Save brand voice"}
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
  const [state, action] = useActionState<SettingsFormState, FormData>(saveBrandVoice, null);
  const voice = initial ?? EMPTY_BRAND_VOICE;

  return (
    <form action={action} className="space-y-4 px-5 py-4">
      <input type="hidden" name="siteId" value={siteId} />

      <Field
        label="Tone"
        htmlFor="tone"
        hint="How the writing should sound. Be specific — “professional but approachable, engineer-to-engineer” beats “friendly”."
      >
        <input
          id="tone"
          name="tone"
          defaultValue={voice.tone}
          className={inputClass()}
          placeholder="professional but approachable, engineer-to-engineer"
        />
      </Field>

      <Field label="Audience" htmlFor="audience" hint="Who is reading, and what they already know.">
        <input
          id="audience"
          name="audience"
          defaultValue={voice.audience}
          className={inputClass()}
          placeholder="EU/US procurement managers and hardware engineers"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Language" htmlFor="language" hint="BCP-47 tag.">
          <input
            id="language"
            name="language"
            defaultValue={voice.language}
            className={inputClass()}
            placeholder="en-US"
          />
        </Field>
        <Field label="Min words" htmlFor="minWords">
          <input
            id="minWords"
            name="minWords"
            type="number"
            min={100}
            defaultValue={voice.wordCountRange[0]}
            className={inputClass("tnum")}
          />
        </Field>
        <Field label="Max words" htmlFor="maxWords">
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
        label="Core topics"
        htmlFor="coreTopics"
        hint="What this site is about. Comma or newline separated."
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
        label="Priority keywords"
        htmlFor="keywords"
        hint="Terms you want to rank for. Topic selection weights these alongside Search Console data."
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
        label="Forbidden"
        htmlFor="forbidden"
        hint="Words and claims the brand will not make. Matched on word boundaries with short inflections — “cheap” also catches “cheaper” and “cheapest”, but not “recheap”."
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
        label="Reference URLs"
        htmlFor="referenceUrls"
        hint="Existing pieces that set the house style."
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
        label="Image style"
        htmlFor="imageStyle"
        hint="Used when image generation is wired up. Safe to leave blank for now."
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
        <SubmitButton />
        {state ? (
          <p className={state.ok ? "text-sm text-pos" : "text-sm text-neg"}>{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}
