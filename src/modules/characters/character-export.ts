// ── Character export helpers ────────────────────────────────────────────────
//
// Two formats are supported:
//   1. Veyra-native JSON (the same shape as the DB row, minus stats and ids).
//   2. Character Card V3 JSON or PNG-with-chunk (compatible with SillyTavern
//      and other CCv3-aware tools).

import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { CharacterRecord } from "./character-types";
import { veyraToCcv3, veyraToCcv3Png } from "./ai-assist/character-io";

function sanitizeFileName(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80) || "character";
}

export async function exportCharacterJson(character: CharacterRecord): Promise<string> {
  const text = JSON.stringify(character, null, 2);
  await navigator.clipboard.writeText(text).catch(() => {
    /* ignore */
  });
  return text;
}

export async function exportCharacterJsonToFile(character: CharacterRecord): Promise<string | null> {
  const path = await save({
    defaultPath: `${sanitizeFileName(character.name)}.veyra.json`,
    filters: [{ name: "Veyra Character", extensions: ["json"] }],
  });
  if (!path) return null;
  await invoke("write_text_file", { path, contents: JSON.stringify(character, null, 2) });
  return path;
}

export function exportCharacterCcv3(character: CharacterRecord): string {
  const card = veyraToCcv3(character);
  return JSON.stringify(card, null, 2);
}

export async function exportCharacterCcv3ToFile(character: CharacterRecord): Promise<string | null> {
  const card = veyraToCcv3(character);
  const text = JSON.stringify(card, null, 2);
  const path = await save({
    defaultPath: `${sanitizeFileName(character.name)}.card.json`,
    filters: [{ name: "Character Card V3", extensions: ["json"] }],
  });
  if (!path) return null;
  await invoke("write_text_file", { path, contents: text });
  return path;
}

export async function exportCharacterCcv3Png(
  character: CharacterRecord,
): Promise<string | null> {
  const path = await save({
    defaultPath: `${sanitizeFileName(character.name)}.png`,
    filters: [{ name: "PNG image", extensions: ["png"] }],
  });
  if (!path) return null;

  // We embed the CCv3 chunk into a 1x1 transparent PNG so the export is
  // self-contained. If the user wants a richer background they can paste
  // the chunk into a larger image externally.
  const basePng = makePlaceholderPng();
  const withChunk = veyraToCcv3Png(basePng, character);
  await invoke("write_binary_file", { path, contents: Array.from(withChunk) });
  return path;
}

// ── Minimal 1x1 transparent PNG (67 bytes) ─────────────────────────────────

function makePlaceholderPng(): Uint8Array {
  const hex =
    "89504e470d0a1a0a" +
    "0000000d49484452" +
    "00000001000000010806000000" +
    "1f15c489" +
    "0000000d49444154" +
    "78da63000100000005000125" +
    "0d0a2db4" +
    "0000000049454e44ae426082";
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
