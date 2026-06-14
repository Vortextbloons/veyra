// ── Avatar gradient palettes (shared by NewCharacterDialog, CharacterListPanel,
//    and CharacterDetailView) ──────────────────────────────────────────────
//
// Uses `bg-gradient-to-br from-*/to-*` utilities. Palette shades are declared
// in `src/index.css` `@theme` so Tailwind v4 emits real CSS for them.

import type { CharacterAvatarColor } from "./character-types";

export const AVATAR_GRADIENTS: Record<CharacterAvatarColor, string> = {
  indigo:  "bg-gradient-to-br from-indigo-500 to-violet-600",
  violet:  "bg-gradient-to-br from-violet-500 to-fuchsia-600",
  blue:    "bg-gradient-to-br from-blue-500 to-sky-600",
  cyan:    "bg-gradient-to-br from-cyan-500 to-teal-500",
  teal:    "bg-gradient-to-br from-teal-500 to-emerald-600",
  emerald: "bg-gradient-to-br from-emerald-500 to-green-600",
  amber:   "bg-gradient-to-br from-amber-500 to-orange-600",
  orange:  "bg-gradient-to-br from-orange-500 to-rose-600",
  rose:    "bg-gradient-to-br from-rose-500 to-pink-600",
  pink:    "bg-gradient-to-br from-pink-500 to-fuchsia-600",
  slate:   "bg-gradient-to-br from-slate-500 to-zinc-700",
};

/** Lookup helper that falls back to `slate` for unknown values. */
export function getAvatarGradient(color: string | undefined): string {
  if (color && color in AVATAR_GRADIENTS) {
    return AVATAR_GRADIENTS[color as CharacterAvatarColor];
  }
  return AVATAR_GRADIENTS.slate;
}
