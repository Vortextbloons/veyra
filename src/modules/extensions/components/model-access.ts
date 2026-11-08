/**
 * Who may apply a Skill.
 *
 * - `auto` — the model may load it on its own, even when the library default
 *   keeps other Skills manual.
 * - `manual` — only the user can apply it; the model never sees it as loadable.
 * - `default` — follow the library-wide setting.
 *
 * Manual use is always available regardless of this control: it selects the
 * instructions, it does not restrict the user.
 */
export type ModelAccess = "auto" | "default" | "manual";

export function modelAccessOf(skill: { modelInvocable?: boolean }): ModelAccess {
  if (skill.modelInvocable === true) return "auto";
  if (skill.modelInvocable === false) return "manual";
  return "default";
}

/** Maps the control back to the stored override; `default` clears it. */
export function modelInvocablePatch(access: ModelAccess): { modelInvocable: boolean | undefined } {
  return { modelInvocable: access === "default" ? undefined : access === "auto" };
}
