// Memory retrieval service.
//
// This file is the ONLY place in the frontend that decides whether memory
// participates in a given turn. The orchestrator imports `buildMemoryPack`
// from here and never inlines the off/mode check.
//
// MVP: deterministic, keyword-based. No embeddings. Phase 6+.

import { estimateTokens } from "@/lib/context";
import { listMemoryNodes, searchMemory, updateMemoryNode } from "@/lib/memory-storage";
import type { MemoryMode, MemoryNode, MemoryPack } from "@/lib/memory-types";
import { buildMemoryContextBlock } from "@/lib/prompts";

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

const PRIORITY_WEIGHT: Record<string, number> = {
  permanent: 1,
  high: 0.85,
  medium: 0.55,
  low: 0.25,
  ephemeral: 0.15,
};

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
  if (!args.query || args.query.trim().length === 0) return null;
  if (args.budget <= 0) return null;

  try {
    const queryTokens = unique(tokenize(args.query));

    // Always seed durable memories. Permanent/manual facts like the user's
    // name should not depend on the current query sharing keywords.
    const durable = await listMemoryNodes({
      status: ["active", "approved", "needs_review"],
      limit: 100,
    });

    const searched = queryTokens.length > 0
      ? await searchMemory(args.query, { limit: 50, projectId: args.projectId })
      : [];

    const candidates = uniqueById([...durable.filter(isDurableSeed), ...searched]);

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
      const keywordMatch = queryTokens.length > 0 ? clamp01(matched.length / queryTokens.length) : 0;
      const titleMatch = queryTokens.some((t) => title.includes(t)) ? 1 : 0;
      const tagMatch =
        node.tags.some((tag) => queryTokens.some((t) => tag.toLowerCase().includes(t))) ? 1 : 0;
      const importance = Math.max(clamp01(node.importance / 5), PRIORITY_WEIGHT[node.priority] ?? 0.55);
      const confidence = clamp01(node.confidence);
      const pinnedBoost = node.isPinned ? 1 : 0;

      const durableBase = isDurableSeed(node) ? 0.2 : 0;
      const score =
        durableBase +
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

    // Build bullets (inner body; wrapped for token budget via buildMemoryContextBlock)
    const lines: string[] = [];
    const permanent = kept.filter((s) => s.node.isPinned || s.node.priority === "permanent" || s.node.importance >= 5);
    const project = kept.filter((s) => s.node.scope === "project" && !permanent.includes(s));
    const other = kept.filter((s) => !permanent.includes(s) && !project.includes(s));

    const addGroup = (label: string, group: ScoredNode[]) => {
      if (group.length === 0) return;
      lines.push(`${label}:`);
      for (const s of group) {
        const typeLabel = s.node.type
          .split("_")
          .map((w) => w[0]?.toUpperCase() + w.slice(1))
          .join(" ");
        const body = s.node.summary.trim() || s.node.content.replace(/\s+/g, " ").trim().slice(0, HARD_TRUNCATE_FALLBACK);
        lines.push(`- [${typeLabel}] ${body}`);
      }
    };

    addGroup("Permanent/user memory", permanent);
    addGroup("Project memory", project);
    addGroup("Related memory", other);

    let inner = lines.join("\n");

    // Budget fit (count wrapped block as sent to the model)
    const budget = args.budget;
    let wrapped = buildMemoryContextBlock(inner);
    let tokens = estimateTokens(wrapped);
    if (tokens > budget) {
      while (lines.length > 0 && estimateTokens(buildMemoryContextBlock(lines.join("\n"))) > budget) {
        lines.pop();
      }
      inner = lines.join("\n");
      wrapped = buildMemoryContextBlock(inner);
      tokens = estimateTokens(wrapped);
      if (tokens > budget && lines.length > 0) {
        const last = lines[lines.length - 1];
        const prefix = lines.slice(0, -1).join("\n");
        const allowedChars = Math.max(
          0,
          budget * 4 - estimateTokens(buildMemoryContextBlock(prefix)) * 4 - 2,
        );
        lines[lines.length - 1] =
          last.length > allowedChars ? last.slice(0, Math.max(0, allowedChars - 1)) + "…" : last;
        inner = lines.join("\n");
        wrapped = buildMemoryContextBlock(inner);
        tokens = estimateTokens(wrapped);
      }
    }

    if (!inner.trim()) return null;

    const content = inner;

    const sourceNodeIds = kept.map((s) => s.node.id);
    void markMemoryUsed(kept.map((s) => s.node));

    return {
      content,
      sourceNodeIds,
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

function uniqueById(nodes: MemoryNode[]): MemoryNode[] {
  return Array.from(new Map(nodes.map((node) => [node.id, node])).values());
}

function isDurableSeed(node: MemoryNode): boolean {
  return (
    node.isPinned ||
    node.priority === "permanent" ||
    node.importance >= 5 ||
    node.origin === "explicit_user_save" ||
    node.origin === "manual_user_edit"
  );
}

async function markMemoryUsed(nodes: MemoryNode[]): Promise<void> {
  const now = new Date().toISOString();
  await Promise.allSettled(
    nodes.map((node) =>
      updateMemoryNode({
        id: node.id,
        lastUsedAt: now,
        useCount: node.useCount + 1,
      }),
    ),
  );
}
