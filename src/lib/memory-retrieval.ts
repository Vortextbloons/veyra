// Memory retrieval service.
//
// This file is the ONLY place in the frontend that decides whether memory
// participates in a given turn. The orchestrator imports `buildMemoryPack`
// from here and never inlines the off/mode check.
//
// MVP: deterministic, keyword-based. No embeddings. Phase 6+.

import { estimateTokens } from "@/lib/context";
import { searchMemory } from "@/lib/memory-storage";
import type { MemoryMode, MemoryNode, MemoryPack } from "@/lib/memory-types";

const STOPWORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","should","could","may","might","must","can",
  "and","or","but","if","then","of","to","in","on","at","for","with","by","from",
  "as","it","this","that","these","those","i","you","he","she","we","they","me",
  "him","her","us","them","my","your","his","its","our","their",
]);

const MAX_NODES = 10;
const NOISE_FLOOR = 0.05;
const HARD_TRUNCATE_FALLBACK = 240;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export interface BuildMemoryPackArgs {
  enabled: boolean;
  mode: MemoryMode;
  query: string;
  projectId?: string;
  budget: number;
}

interface ScoredNode {
  node: MemoryNode;
  score: number;
  parts: { kw: number; title: number; tag: number; imp: number; conf: number; pin: number };
  matchedTokens: string[];
}

export async function buildMemoryPack(
  args: BuildMemoryPackArgs,
): Promise<MemoryPack | null> {
  // Hard rules
  if (!args.enabled) return null;
  if (args.mode === "off") return null;
  if (args.mode === "manual_only") return null;
  if (!args.query || args.query.trim().length === 0) return null;
  if (args.budget <= 0) return null;

  try {
    const queryTokens = unique(tokenize(args.query));
    if (queryTokens.length === 0) return null;

    // Fetch candidates. The Rust search_memory does LIKE-based scoring; we
    // re-rank here with the spec's weighted formula.
    const candidates = await searchMemory(args.query, { limit: 50, projectId: args.projectId });

    // Filter
    const allowed = candidates.filter((node) => {
      if (node.status === "archived" || node.status === "rejected") return false;
      if (node.status === "needs_review" && !node.isPinned) return false;
      // Project scope: only inject project-scoped nodes when the project matches.
      if (node.scope === "project" && node.projectId && node.projectId !== args.projectId) {
        return false;
      }
      return true;
    });

    if (allowed.length === 0) return null;

    // Score
    const scored: ScoredNode[] = allowed.map((node) => {
      const title = node.title.toLowerCase();
      const summary = node.summary.toLowerCase();
      const content = node.content.toLowerCase();
      const haystack = `${title} ${summary} ${content}`;

      const matched = queryTokens.filter((t) => haystack.includes(t));
      const keywordMatch = clamp01(matched.length / queryTokens.length);
      const titleMatch = queryTokens.some((t) => title.includes(t)) ? 1 : 0;
      const tagMatch =
        node.tags.some((tag) => queryTokens.some((t) => tag.toLowerCase().includes(t))) ? 1 : 0;
      const importance = clamp01(node.importance / 5);
      const confidence = clamp01(node.confidence);
      const pinnedBoost = node.isPinned ? 1 : 0;

      const score =
        keywordMatch * 0.35 +
        titleMatch * 0.15 +
        tagMatch * 0.15 +
        importance * 0.15 +
        confidence * 0.15 +
        pinnedBoost * 0.05;

      return { node, score, parts: { kw: keywordMatch, title: titleMatch, tag: tagMatch, imp: importance, conf: confidence, pin: pinnedBoost }, matchedTokens: matched };
    });

    // Sort + noise floor
    scored.sort((a, b) => b.score - a.score);
    const kept = scored.filter((s) => s.score >= NOISE_FLOOR).slice(0, MAX_NODES);
    if (kept.length === 0) return null;

    // Build bullets
    const lines: string[] = ["Relevant memory:"];
    for (const s of kept) {
      const typeLabel = s.node.type
        .split("_")
        .map((w) => w[0]?.toUpperCase() + w.slice(1))
        .join(" ");
      const body = s.node.summary.trim() || s.node.content.replace(/\s+/g, " ").trim().slice(0, HARD_TRUNCATE_FALLBACK);
      lines.push(`- [${typeLabel}] ${body}`);
    }
    let content = lines.join("\n");

    // Budget fit
    const budget = args.budget;
    let tokens = estimateTokens(content);
    if (tokens > budget) {
      // Drop trailing bullets (keep header).
      while (lines.length > 1 && estimateTokens(lines.join("\n")) > budget) {
        lines.pop();
      }
      content = lines.join("\n");
      tokens = estimateTokens(content);
      // If still over budget, truncate the last bullet.
      if (tokens > budget && lines.length > 0) {
        const last = lines[lines.length - 1];
        const allowedChars = Math.max(0, budget * 4 - estimateTokens(lines.slice(0, -1).join("\n")) * 4 - 2);
        lines[lines.length - 1] = (last.length > allowedChars ? last.slice(0, Math.max(0, allowedChars - 1)) + "…" : last);
        content = lines.join("\n");
        tokens = estimateTokens(content);
      }
    }

    return {
      content,
      sourceNodeIds: kept.map((s) => s.node.id),
      sourceFileIds: unique(kept.map((s) => s.node.fileId).filter((x): x is string => Boolean(x))),
      sourceFolderIds: unique(kept.map((s) => s.node.folderId).filter((x): x is string => Boolean(x))),
      tokenCount: tokens,
      budgetUsed: clamp01(tokens / budget),
      reasons: {
        query: args.query.slice(0, 80),
        candidates: String(allowed.length),
        included: String(kept.length),
        top: kept[0]?.node.title?.slice(0, 80) ?? "",
      },
    };
  } catch (err) {
    // Defensive: never break the chat pipeline.
    if (typeof console !== "undefined") {
      console.warn("[memory-retrieval] buildMemoryPack failed:", err);
    }
    return null;
  }
}
