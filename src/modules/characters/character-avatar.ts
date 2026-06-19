// ── Character avatar storage ────────────────────────────────────────────────
//
// Avatars are stored under <appData>/character-avatars/<characterId>.<ext>.
// The DB column `avatar_path` stores the relative path (e.g. "character-avatars/char_x.png").
// We never embed base64 in the database; the on-disk file is the source of truth.
//
// In the renderer, we expose a "convertFileSrc"-style helper that maps a stored
// path to a URL Tauri can load. We use a memory cache so the same avatar isn't
// re-fetched repeatedly.

import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

const avatarCache = new Map<string, string>();

function detectImageExtension(bytes: Uint8Array): "png" | "jpg" | "gif" | "webp" | null {
  if (bytes.length < 12) return null;
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    (bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61)
  ) {
    return "gif";
  }
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "webp";
  }
  return null;
}

export async function saveCharacterAvatar(
  characterId: string,
  bytes: Uint8Array,
): Promise<string> {
  const ext = detectImageExtension(bytes);
  if (!ext) {
    throw new Error("Unsupported image format. Use PNG, JPEG, GIF, or WebP.");
  }
  const relativePath = await invoke<string>("save_character_avatar", {
    characterId,
    contents: Array.from(bytes),
  });
  avatarCache.delete(relativePath);
  return relativePath;
}

export async function deleteCharacterAvatar(relativePath: string): Promise<void> {
  if (!relativePath) return;
  await invoke<void>("delete_character_avatar", { avatarPath: relativePath });
  avatarCache.delete(relativePath);
}

/**
 * Asynchronously load the avatar bytes and convert to a blob URL. Use this in
 * a useEffect and call setState with the returned URL.
 */
export async function ensureCharacterAvatarUrl(relativePath: string | undefined | null): Promise<string | null> {
  if (!relativePath) return null;
  const cached = avatarCache.get(relativePath);
  if (cached) return cached;
  try {
    const bytes = await invoke<number[]>("read_character_avatar", { avatarPath: relativePath });
    const u8 = new Uint8Array(bytes);
    const ext = detectImageExtension(u8) ?? "png";
    const mime =
      ext === "jpg" ? "image/jpeg" :
      ext === "gif" ? "image/gif" :
      ext === "webp" ? "image/webp" :
      "image/png";
    const blob = new Blob([u8], { type: mime });
    const url = URL.createObjectURL(blob);
    avatarCache.set(relativePath, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Convert an absolute file path (returned by `tauri-plugin-dialog`'s open())
 * to a usable URL directly without copying bytes. Useful for showing a
 * "preview" of the chosen file before saving.
 */
export function filePathToUrl(path: string): string {
  return convertFileSrc(path);
}
