import type { CharacterLorebookEntry } from "./character-types";

export interface LorebookEvaluateOptions {
  /** How many trailing messages to scan. */
  scanDepth: number;
  /** Cap on entries returned after priority + ordering. */
  maxEntries: number;
  /** Random source for `probability` roll (defaults to Math.random; pass a
   *  deterministic seed for tests). */
  random?: () => number;
}

export interface LorebookEvaluateResult {
  matches: CharacterLorebookEntry[];
  /** True if the cap dropped matched entries. */
  budgetExceeded: boolean;
}

function scanText(messages: Array<{ role: string; content: string }>, scanDepth: number): string {
  const slice = messages.slice(Math.max(0, messages.length - scanDepth));
  return slice
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => m.content)
    .join("\n\n");
}

function entryMatches(
  entry: CharacterLorebookEntry,
  haystack: string,
  options: { random: () => number },
): boolean {
  if (!entry.enabled) return false;
  if (entry.constant) return true;
  const probability = entry.probability ?? 100;
  if (probability < 100 && options.random() * 100 > probability) return false;

  const text = entry.caseSensitive ? haystack : haystack.toLowerCase();
  const keys = (entry.keys ?? []).map((k) => (entry.caseSensitive ? k : k.toLowerCase()));
  if (keys.length === 0) return false;

  const matchType = entry.matchType ?? "any";
  if (matchType === "regex") {
    return keys.some((pattern) => {
      try {
        return new RegExp(pattern, entry.caseSensitive ? "" : "i").test(haystack);
      } catch {
        return false;
      }
    });
  }
  if (matchType === "all") {
    return keys.every((k) => text.includes(k));
  }
  return keys.some((k) => text.includes(k));
}

export function evaluateLorebook(
  entries: CharacterLorebookEntry[] | undefined,
  messages: Array<{ role: string; content: string }>,
  options: LorebookEvaluateOptions,
): LorebookEvaluateResult {
  if (!entries || entries.length === 0) {
    return { matches: [], budgetExceeded: false };
  }
  const random = options.random ?? Math.random;
  const haystack = scanText(messages, Math.max(0, options.scanDepth));
  if (!haystack.trim()) return { matches: [], budgetExceeded: false };

  const matched = entries.filter((e) => entryMatches(e, haystack, { random }));

  matched.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.insertionOrder - b.insertionOrder;
  });

  const budgetExceeded = matched.length > options.maxEntries;
  return {
    matches: matched.slice(0, Math.max(0, options.maxEntries)),
    budgetExceeded,
  };
}
