// Memory retrieval service.
//
// This file is the ONLY place in the frontend that decides whether memory
// participates in a given turn. The orchestrator imports `buildMemoryPackWithInfo`
// from here and never inlines the off/mode check.

import type { ChatMessage } from "@/modules/chat/chat-types";
import { estimateTokens } from "@/lib/context";
import { listMemoryNodes, searchMemory, updateMemoryNode, vectorSearchMemory } from "@/modules/memory/memory-storage";
import {
  isProtectedMemory,
  type MemoryMode,
  type MemoryNode,
  type MemoryPack,
  type MemoryRetrievalInfo,
} from "@/modules/memory/memory-types";
import {
  buildRetrievalQuery,
  isManualOnlyOrigin,
  noiseFloorForMode,
  shouldRetrieveMemory,
} from "@/modules/memory/memory-router";
import { buildMemoryContextBlock } from "@/lib/prompts";
import { isProfileNode } from "@/modules/memory/profile-helpers";
import { useSettingsStore } from "@/stores/settings-store";

const STOPWORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","should","could","may","might","must","can",
  "and","or","but","if","then","of","to","in","on","at","for","with","by","from",
  "as","it","this","that","these","those","i","you","he","she","we","they","me",
  "him","her","us","them","my","your","his","its","our","their",
]);

const HARD_TRUNCATE_FALLBACK = 240;
const DURABLE_LIST_LIMIT = 100;
const SEARCH_LIMIT = 50;

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

interface BuildMemoryPackArgs {
  enabled: boolean;
  mode: MemoryMode;
  query: string;
  /** Recent messages for query expansion and router context */
  messages?: ChatMessage[];
  projectId?: string;
  budget: number;
  maxNodes?: number;
}

interface ScoredNode {
  node: MemoryNode;
  score: number;
  matchedTokens: string[];
}

interface BuildMemoryResult {
  pack: MemoryPack | null;
  info: MemoryRetrievalInfo;
}

function recentTurnsFromMessages(messages: ChatMessage[]): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}

function recencyBoost(node: MemoryNode): number {
  if (!node.lastUsedAt) return 0;
  const ageMs = Date.now() - new Date(node.lastUsedAt).getTime();
  const days = ageMs / (24 * 60 * 60 * 1000);
  if (days <= 1) return 0.12;
  if (days <= 7) return 0.08;
  if (days <= 30) return 0.04;
  return 0;
}

function useCountBoost(node: MemoryNode): number {
  if (node.useCount <= 0) return 0;
  return clamp01(Math.log10(node.useCount + 1) / 2) * 0.08;
}

function projectBoost(node: MemoryNode, projectId?: string): number {
  if (!projectId) return 0;
  if (node.scope === "project" && node.projectId === projectId) return 0.15;
  return 0;
}

// Category-aware query intent detection and boosting
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  identity: ["name", "who", "me", "about", "user", "person"],
  communication: ["prefer", "style", "format", "response", "communicate", "tone"],
  expertise: ["skill", "know", "learn", "domain", "expert", "proficiency"],
  interests: ["interest", "hobby", "like", "enjoy", "favorite", "topic"],
  work: ["work", "job", "role", "responsibility", "task", "project"],
  learning: ["learn", "study", "course", "education", "book", "tutorial"],
  preferences: ["prefer", "like", "dislike", "style", "setup", "config"],
};

function detectQueryIntent(query: string): string | null {
  const lower = query.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return category;
    }
  }
  return null;
}

function categoryBoost(node: MemoryNode, intentCategory: string | null): number {
  if (!intentCategory) return 0;
  // Boost profile nodes when the query matches their category
  if (node.origin === "profile_setup" || node.tags.some((t) => t.startsWith("profile:"))) {
    const nodeCategory = node.tags
      .find((t) => t.startsWith("profile:"))
      ?.split(":")[1];
    if (nodeCategory === intentCategory) return 0.15;
  }
  return 0;
}

function isDurableSeed(node: MemoryNode, mode: MemoryMode): boolean {
  if (mode === "manual_only") {
    return isManualOnlyOrigin(node);
  }
  return isProtectedMemory(node);
}

function allowNode(node: MemoryNode, mode: MemoryMode, projectId?: string): boolean {
  if (node.status === "archived" || node.status === "rejected") return false;

  if (node.status === "needs_review") {
    const allowUnverified =
      node.isPinned ||
      mode === "review_all" ||
      (mode === "aggressive_project_memory" &&
        node.scope === "project" &&
        (!node.projectId || node.projectId === projectId));
    if (!allowUnverified) return false;
  }

  if (node.scope === "project" && node.projectId && node.projectId !== projectId) {
    return false;
  }

  if (mode === "manual_only" && node.origin === "auto_extracted" && !node.isPinned) {
    return false;
  }

  return true;
}

function formatNodeLine(node: MemoryNode): string {
  const typeLabel = node.type
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
  const unverified = node.status === "needs_review" ? "[unverified] " : "";
  const body =
    node.summary.trim() ||
    node.content.replace(/\s+/g, " ").trim().slice(0, HARD_TRUNCATE_FALLBACK);
  return `- [${typeLabel}] ${unverified}${body}`;
}

function compactGroupSummary(group: ScoredNode[]): string | null {
  if (group.length < 3) return null;
  const titles = group.map((s) => s.node.title.trim()).filter(Boolean);
  if (titles.length < 3) return null;
  return titles.slice(0, 6).join("; ");
}

export async function buildMemoryPackWithInfo(
  args: BuildMemoryPackArgs,
): Promise<BuildMemoryResult> {
  if (!args.enabled) {
    return {
      pack: null,
      info: { status: "disabled", detail: "Memory toggle off" },
    };
  }
  if (args.mode === "off") {
    return {
      pack: null,
      info: { status: "disabled", detail: "Memory mode is off in settings" },
    };
  }
  if (!args.query?.trim()) {
    return { pack: null, info: { status: "empty", detail: "Empty message" } };
  }
  if (args.budget <= 0) {
    return { pack: null, info: { status: "empty", detail: "Memory token budget is zero" } };
  }

  const recentTurns = args.messages ? recentTurnsFromMessages(args.messages) : [];
  const contextSnippet = recentTurns
    .slice(-4)
    .map((t) => t.content)
    .join(" ")
    .slice(0, 500);

  const router = shouldRetrieveMemory({
    query: args.query,
    mode: args.mode,
    contextSnippet,
  });

  const searchQuery = buildRetrievalQuery(args.query, recentTurns);
  const maxNodes = Math.max(1, Math.min(25, args.maxNodes ?? 10));
  const noiseFloor = noiseFloorForMode(args.mode);

  try {
    const queryTokens = unique(tokenize(searchQuery));
    const alwaysSeedDurable = router.retrieve || isDurableSeedQuery(args.query);
    const intentCategory = detectQueryIntent(args.query);

    // Read vector search settings from store
    const {
      vectorSearchEnabled,
      vectorSearchEndpointUrl,
      vectorSearchModel,
      vectorWeight,
      bm25Weight,
      metaWeight,
    } = useSettingsStore.getState();

    let durable: MemoryNode[] = [];
    if (alwaysSeedDurable) {
      const listed = await listMemoryNodes({
        status: ["active", "approved", "needs_review"],
        limit: DURABLE_LIST_LIMIT,
      });
      durable = listed.filter((n) => isDurableSeed(n, args.mode));
    }

    let searched: MemoryNode[] = [];
    let vectorSearched: MemoryNode[] = [];

    if (router.retrieve && searchQuery.trim().length > 0) {
      if (vectorSearchEnabled) {
        try {
          const vectorResult = await vectorSearchMemory(searchQuery, {
            limit: SEARCH_LIMIT,
            projectId: args.projectId,
            endpointUrl: vectorSearchEndpointUrl,
            model: vectorSearchModel,
            vectorWeight,
            bm25Weight,
          });
          vectorSearched = vectorResult.nodes;
        } catch {
          // Vector search failed, fall back to keyword search
          searched = await searchMemory(searchQuery, {
            limit: SEARCH_LIMIT,
            projectId: args.projectId,
          });
        }
      } else {
        searched = await searchMemory(searchQuery, {
          limit: SEARCH_LIMIT,
          projectId: args.projectId,
        });
      }
    }

    // Merge vector and keyword results, dedup by ID
    const candidates = uniqueById([...durable, ...vectorSearched, ...searched]);
    const allowed = candidates.filter((n) => allowNode(n, args.mode, args.projectId));

    if (!router.retrieve && allowed.length === 0) {
      return {
        pack: null,
        info: { status: "skipped", detail: router.reason },
      };
    }

    if (allowed.length === 0) {
      return {
        pack: null,
        info: {
          status: "empty",
          detail: "No matching memories in store",
          pack: undefined,
        },
      };
    }

    const scored: ScoredNode[] = allowed.map((node) => {
      const title = node.title.toLowerCase();
      const summary = node.summary.toLowerCase();
      const content = node.content.toLowerCase();
      const haystack = `${title} ${summary} ${content}`;

      const matched = queryTokens.filter((t) => haystack.includes(t));
      const keywordMatch =
        queryTokens.length > 0 ? clamp01(matched.length / queryTokens.length) : 0;
      const titleMatch = queryTokens.some((t) => title.includes(t)) ? 1 : 0;
      const tagMatch = node.tags.some((tag) =>
        queryTokens.some((t) => tag.toLowerCase().includes(t)),
      )
        ? 1
        : 0;
      const importance = Math.max(
        clamp01(node.importance / 5),
        PRIORITY_WEIGHT[node.priority] ?? 0.55,
      );
      const confidence = clamp01(node.confidence);
      const pinnedBoost = node.isPinned ? 1 : 0;
      const durableBase = isDurableSeed(node, args.mode) ? 0.2 : 0;

      const retrievalBase = node.relevanceScore ?? (keywordMatch * 0.3 + titleMatch * 0.14 + tagMatch * 0.12);
      const metaScore =
        durableBase +
        importance * 0.3 +
        confidence * 0.2 +
        pinnedBoost * 0.1 +
        recencyBoost(node) +
        useCountBoost(node) +
        projectBoost(node, args.projectId) +
        categoryBoost(node, intentCategory);

      const score = retrievalBase + metaWeight * metaScore;

      return { node, score, matchedTokens: matched };
    });

    scored.sort((a, b) => b.score - a.score);
    const kept = scored.filter((s) => s.score >= noiseFloor).slice(0, maxNodes);

    if (kept.length === 0) {
      return {
        pack: null,
        info: {
          status: "empty",
          detail: `No memories above relevance threshold (${allowed.length} candidates)`,
        },
      };
    }

    const lines: string[] = [];
    const profile = kept.filter((s) => isProfileNode(s.node));
    const permanent = kept.filter(
      (s) =>
        !isProfileNode(s.node) &&
        (s.node.isPinned ||
        s.node.priority === "permanent" ||
        s.node.importance >= 5 ||
        s.node.origin === "explicit_user_save"),
    );
    const project = kept.filter(
      (s) => s.node.scope === "project" && !permanent.includes(s) && !profile.includes(s),
    );
    const other = kept.filter((s) => !permanent.includes(s) && !project.includes(s) && !profile.includes(s));

    const addGroup = (label: string, group: ScoredNode[]) => {
      if (group.length === 0) return;
      const summary = compactGroupSummary(group);
      if (summary) {
        lines.push(`${label} (topics): ${summary}`);
      }
      lines.push(`${label}:`);
      for (const s of group) {
        lines.push(formatNodeLine(s.node));
      }
    };

    addGroup("User profile", profile);
    addGroup("Permanent/user memory", permanent);
    addGroup("Project memory", project);
    addGroup("Related memory", other);

    let inner = lines.join("\n");
    const budget = args.budget;
    let wrapped = buildMemoryContextBlock(inner);
    let tokens = estimateTokens(wrapped);

    if (tokens > budget) {
      let lo = 0;
      let hi = lines.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const candidate = lines.slice(0, mid).join("\n");
        if (estimateTokens(buildMemoryContextBlock(candidate)) <= budget) lo = mid;
        else hi = mid - 1;
      }
      lines.splice(lo);
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
          last.length > allowedChars
            ? last.slice(0, Math.max(0, allowedChars - 1)) + "…"
            : last;
        inner = lines.join("\n");
        wrapped = buildMemoryContextBlock(inner);
        tokens = estimateTokens(wrapped);
      }
    }

    if (!inner.trim()) {
      return {
        pack: null,
        info: { status: "empty", detail: "Memory pack empty after token budget trim" },
      };
    }

    const pack: MemoryPack = {
      content: inner,
      sourceNodeIds: kept.map((s) => s.node.id),
      sourceFileIds: unique(kept.map((s) => s.node.fileId).filter((x): x is string => Boolean(x))),
      sourceFolderIds: unique(
        kept.map((s) => s.node.folderId).filter((x): x is string => Boolean(x)),
      ),
      tokenCount: tokens,
      budgetUsed: clamp01(tokens / budget),
      reasons: {
        query: args.query.slice(0, 80),
        search: searchQuery.slice(0, 120),
        router: router.reason,
        candidates: String(allowed.length),
        included: String(kept.length),
        top: kept[0]?.node.title?.slice(0, 80) ?? "",
      },
    };

    void markMemoryUsed(kept.map((s) => s.node));

    return {
      pack,
      info: {
        status: "used",
        detail: `${kept.length} memor${kept.length === 1 ? "y" : "ies"} · ${tokens} tokens`,
        pack,
      },
    };
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[memory-retrieval] buildMemoryPack failed:", err);
    }
    return {
      pack: null,
      info: {
        status: "empty",
        detail: err instanceof Error ? err.message : "Retrieval failed",
      },
    };
  }
}

function isDurableSeedQuery(query: string): boolean {
  return /\b(remember|my name|who am i|about me|preference)\b/i.test(query);
}

function uniqueById(nodes: MemoryNode[]): MemoryNode[] {
  return Array.from(new Map(nodes.map((node) => [node.id, node])).values());
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
