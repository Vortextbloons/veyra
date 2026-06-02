// Decides whether to run memory retrieval for a turn (no I/O).

import type { MemoryMode } from "@/lib/memory-types";

const GREETING_ONLY =
  /^(hi|hello|hey|yo|thanks|thank you|ok|okay|sure|yes|no|bye|goodbye|good morning|good night)[\s!.?]*$/i;

const MEMORY_CUE =
  /\b(remember|memory|memories|recall|what do you know|what did i|my name|my preference|preferences?|about me|earlier|before|last time|we discussed|you said|you know|saved|pinned|project|context|continue|follow up)\b/i;

const TRIVIAL_MATH =
  /^\s*\d+\s*[-+*/^%]\s*\d+/;

export interface MemoryRouterInput {
  query: string;
  mode: MemoryMode;
  /** Recent user/assistant text merged for cue detection */
  contextSnippet?: string;
}

export interface MemoryRouterResult {
  retrieve: boolean;
  reason: string;
}

export function shouldRetrieveMemory(input: MemoryRouterInput): MemoryRouterResult {
  if (input.mode === "off") {
    return { retrieve: false, reason: "Memory mode is off" };
  }

  const query = input.query.trim();
  const context = (input.contextSnippet ?? "").trim();
  const combined = `${query}\n${context}`.trim();

  if (!query) {
    return { retrieve: false, reason: "Empty message" };
  }

  if (MEMORY_CUE.test(query) || MEMORY_CUE.test(context)) {
    return { retrieve: true, reason: "Memory-related phrasing" };
  }

  if (GREETING_ONLY.test(query)) {
    return { retrieve: false, reason: "Greeting only — skipped retrieval" };
  }

  if (query.length < 12 && !MEMORY_CUE.test(combined)) {
    return { retrieve: false, reason: "Short message — skipped retrieval" };
  }

  if (TRIVIAL_MATH.test(query)) {
    return { retrieve: false, reason: "Simple calculation — skipped retrieval" };
  }

  // manual_only still retrieves pinned / explicit durable seeds via pack builder
  if (input.mode === "manual_only") {
    return { retrieve: true, reason: "Manual mode — pinned and explicit memories only" };
  }

  return { retrieve: true, reason: "Default retrieval" };
}

/** Merge latest user message with recent turns for keyword search. */
export function buildRetrievalQuery(
  latestUserMessage: string,
  recentTurns: { role: "user" | "assistant"; content: string }[],
): string {
  const parts: string[] = [];
  const tail = recentTurns.slice(-6);
  for (const turn of tail) {
    const text = turn.content.trim();
    if (text.length > 0) parts.push(text.slice(0, 400));
  }
  const latest = latestUserMessage.trim();
  if (latest && (parts.length === 0 || parts[parts.length - 1] !== latest)) {
    parts.push(latest);
  }
  return parts.join("\n").slice(0, 2000);
}

export function noiseFloorForMode(mode: MemoryMode): number {
  switch (mode) {
    case "aggressive_project_memory":
      return 0.03;
    case "review_all":
    case "safe_auto_save":
      return 0.05;
    case "manual_only":
      return 0.08;
    default:
      return 0.05;
  }
}

export function isManualOnlyOrigin(node: {
  origin: string;
  isPinned: boolean;
  priority: string;
}): boolean {
  return (
    node.isPinned ||
    node.priority === "permanent" ||
    node.origin === "explicit_user_save" ||
    node.origin === "manual_user_edit"
  );
}
