/**
 * Interpolation for dictionary strings.
 *
 * The dictionary is handed to client components through the RSC boundary, so
 * every value has to survive serialization. Functions do not — React rejects
 * them at render time, and `next build` does not catch it because the failure
 * only happens when a page actually renders. So interpolating copy is stored as
 * a template with `{name}` holes and filled in here.
 */

/**
 * Two forms of the same string. Which one is used is decided by the count the
 * call site passes to `fmt` — the dictionary does not guess, because the
 * deciding number is not always the only number in the sentence.
 */
export type PluralForms = { one: string; other: string };

export type Vars = Record<string, string | number>;

/**
 * Fills `{name}` holes in a template.
 *
 * With `PluralForms`, `count` selects the form: exactly 1 takes `one`. This is
 * the English rule; Chinese has no plural inflection and sets both forms to the
 * same string, so the selection is harmless there.
 */
export function fmt(
  template: string | PluralForms,
  vars: Vars = {},
  count?: number,
): string {
  const text =
    typeof template === "string"
      ? template
      : count === 1
        ? template.one
        : template.other;

  // A missing variable leaves the placeholder visible rather than printing
  // "undefined" — an untranslated hole is easier to spot and report than a
  // word that reads like real copy.
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}
