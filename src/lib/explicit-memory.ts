// Immediate save when the user explicitly asks to remember something.

import { createMemoryNode } from "@/lib/memory-storage";
import { useMemoryStore } from "@/stores/memory-store";

const REMEMBER_PATTERNS: { pattern: RegExp; strip: RegExp }[] = [
  {
    pattern: /^\/remember\s+(.+)/is,
    strip: /^\/remember\s+/i,
  },
  {
    pattern: /^(please\s+)?remember\s+(?:that\s+)?(.+)/is,
    strip: /^(please\s+)?remember\s+(?:that\s+)?/i,
  },
  {
    pattern: /^(please\s+)?save\s+this\s*(?::|-)?\s*(.+)/is,
    strip: /^(please\s+)?save\s+this\s*(?::|-)?\s*/i,
  },
  {
    pattern: /^(please\s+)?don'?t\s+forget\s+(?:that\s+)?(.+)/is,
    strip: /^(please\s+)?don'?t\s+forget\s+(?:that\s+)?/i,
  },
];

export interface ExplicitMemorySaveResult {
  saved: boolean;
  title?: string;
  error?: string;
}

function titleFromContent(content: string): string {
  const first = content.split(/[.!?\n]/)[0]?.trim() ?? content;
  if (first.length <= 72) return first;
  return `${first.slice(0, 69)}…`;
}

export function parseExplicitRememberRequest(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length < 4) return null;

  for (const { pattern, strip } of REMEMBER_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const body = (match[2] ?? match[1] ?? "").replace(strip, "").trim();
    if (body.length >= 3) return body;
  }

  return null;
}

export async function trySaveExplicitMemory(
  text: string,
  options?: { conversationId?: string; projectId?: string },
): Promise<ExplicitMemorySaveResult> {
  const content = parseExplicitRememberRequest(text);
  if (!content) return { saved: false };

  try {
    const title = titleFromContent(content);
    await createMemoryNode({
      folderId: "default",
      conversationId: options?.conversationId,
      projectId: options?.projectId,
      title,
      content,
      summary: content.length > 180 ? `${content.slice(0, 177)}…` : content,
      type: "instruction",
      scope: options?.projectId ? "project" : "global",
      tags: ["explicit", "user-request"],
      importance: 5,
      confidence: 1,
      priority: "permanent",
      origin: "explicit_user_save",
      status: "active",
      isPinned: true,
    });
    await useMemoryStore.getState().hydrateMemory();
    return { saved: true, title };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { saved: false, error: message };
  }
}
