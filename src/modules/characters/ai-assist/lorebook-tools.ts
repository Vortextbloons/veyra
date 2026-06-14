// ── Local lorebook utilities ────────────────────────────────────────────────
//
// Pure helpers used by the lorebook editor tab for duplicate detection,
// similarity scoring, and quick filter tests.

import type { CharacterLorebookEntry } from "../character-types";

export interface DuplicateGroup {
  /** id of the canonical entry (the highest priority + lowest insertionOrder). */
  primaryId: string;
  ids: string[];
  /** Overlap score 0..1. */
  score: number;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

function keyOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const la = a.map((k) => k.toLowerCase());
  const lb = b.map((k) => k.toLowerCase());
  let inter = 0;
  for (const k of la) if (lb.includes(k)) inter++;
  return inter / Math.max(1, Math.min(la.length, lb.length));
}

/**
 * Group entries that look like duplicates. The threshold is intentionally
 * conservative: high key overlap OR very high content overlap.
 */
export function findDuplicateGroups(
  entries: CharacterLorebookEntry[],
  options: { keyThreshold?: number; contentThreshold?: number } = {},
): DuplicateGroup[] {
  const keyT = options.keyThreshold ?? 0.6;
  const contentT = options.contentThreshold ?? 0.85;
  const groups: DuplicateGroup[] = [];
  const visited = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    if (visited.has(a.id)) continue;
    const cluster: CharacterLorebookEntry[] = [a];
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j];
      if (visited.has(b.id)) continue;
      const ko = keyOverlap(a.keys, b.keys);
      const co = jaccard(tokenize(a.content), tokenize(b.content));
      if (ko >= keyT || co >= contentT) {
        cluster.push(b);
      }
    }
    if (cluster.length > 1) {
      const sorted = [...cluster].sort((x, y) => {
        if (x.priority !== y.priority) return y.priority - x.priority;
        return x.insertionOrder - y.insertionOrder;
      });
      const primaryId = sorted[0].id;
      const score = cluster.reduce((max, e) => {
        const ko = keyOverlap(a.keys, e.keys);
        const co = jaccard(tokenize(a.content), tokenize(e.content));
        return Math.max(max, ko, co);
      }, 0);
      groups.push({
        primaryId,
        ids: cluster.map((e) => e.id),
        score,
      });
      for (const e of cluster) visited.add(e.id);
    }
  }
  return groups;
}

/**
 * Merge a group into a single entry. Keys are unioned (case-preserved), content
 * is concatenated with a marker, priority is the max, and the primary id is
 * kept.
 */
export function mergeLorebookGroup(
  entries: CharacterLorebookEntry[],
  primaryId: string,
): CharacterLorebookEntry {
  const sorted = [...entries].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.insertionOrder - b.insertionOrder;
  });
  const primary = sorted.find((e) => e.id === primaryId) ?? sorted[0];
  const keySet = new Set<string>();
  const allKeys: string[] = [];
  for (const e of entries) {
    for (const k of e.keys) {
      const lower = k.toLowerCase();
      if (!keySet.has(lower)) {
        keySet.add(lower);
        allKeys.push(k);
      }
    }
  }
  const contentParts: string[] = [];
  for (const e of entries) {
    if (e.id === primary.id) {
      contentParts.push(e.content);
    } else {
      contentParts.push(`[merged from "${e.comment ?? e.keys.join(",")}"]\n${e.content}`);
    }
  }
  return {
    ...primary,
    keys: allKeys,
    content: contentParts.join("\n\n"),
    priority: Math.max(...entries.map((e) => e.priority)) as 1 | 2 | 3 | 4 | 5,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Build a "test" report for a lorebook against a message list. Returns the
 * matched entries plus the snippet that triggered them. Pure function.
 */
export interface LorebookTestReport {
  matched: Array<{ entry: CharacterLorebookEntry; snippet: string }>;
  budgetExceeded: boolean;
  totalEntries: number;
}

export function testLorebook(
  entries: CharacterLorebookEntry[] | undefined,
  messages: Array<{ role: string; content: string }>,
  options: { scanDepth?: number; maxEntries?: number } = {},
): LorebookTestReport {
  const scanDepth = Math.max(1, options.scanDepth ?? 4);
  const maxEntries = Math.max(1, options.maxEntries ?? 6);
  const slice = messages.slice(Math.max(0, messages.length - scanDepth));
  const userAssistant = slice.filter((m) => m.role === "user" || m.role === "assistant");
  const haystack = userAssistant.map((m) => m.content).join("\n\n");
  const haystackLower = haystack.toLowerCase();

  if (!entries || entries.length === 0 || !haystack.trim()) {
    return { matched: [], budgetExceeded: false, totalEntries: entries?.length ?? 0 };
  }

  const matches: Array<{ entry: CharacterLorebookEntry; snippet: string }> = [];
  for (const entry of entries) {
    if (!entry.enabled) continue;
    let triggered = entry.constant;
    let snippet = "";
    if (!triggered) {
      const keys = entry.keys ?? [];
      if (keys.length === 0) continue;
      for (const k of keys) {
        const needle = entry.caseSensitive ? k : k.toLowerCase();
        const text = entry.caseSensitive ? haystack : haystackLower;
        const idx = text.indexOf(needle);
        if (idx >= 0) {
          triggered = true;
          const start = Math.max(0, idx - 40);
          const end = Math.min(text.length, idx + needle.length + 40);
          snippet = haystack.slice(start, end);
          break;
        }
      }
    } else {
      snippet = haystack.slice(0, 80);
    }
    if (triggered) {
      matches.push({ entry, snippet });
    }
  }
  matches.sort((a, b) => {
    if (a.entry.priority !== b.entry.priority) return b.entry.priority - a.entry.priority;
    return a.entry.insertionOrder - b.entry.insertionOrder;
  });
  return {
    matched: matches.slice(0, maxEntries),
    budgetExceeded: matches.length > maxEntries,
    totalEntries: entries.length,
  };
}
