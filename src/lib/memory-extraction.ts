import type { ChatMessage } from "@/lib/chat-types";
import { getProviderAdapter } from "@/lib/providers";
import { createMemoryNode, searchMemory } from "@/lib/memory-storage";
import type { CreateMemoryNode, MemoryNode, MemoryPriority } from "@/lib/memory-types";
import {
  buildMemoryExtractionUserMessage,
  MEMORY_EXTRACTION_SYSTEM,
} from "@/lib/prompts";
import { useChatStore } from "@/stores/chat-store";
import { useMemoryStore } from "@/stores/memory-store";

const MIN_NEW_MESSAGES = 4;
const MIN_NEW_EXCHANGES = 2;
const MAX_BATCH_MESSAGES = 16;
const MIN_PENDING_MS = 90 * 1000;
const EPHEMERAL_TTL_DAYS = 7;

type ExtractedCandidate = {
  title?: string;
  content?: string;
  summary?: string;
  type?: MemoryNode["type"];
  scope?: MemoryNode["scope"];
  priority?: MemoryPriority;
  importance?: number;
  confidence?: number;
  tags?: string[];
  retention?: "keep" | "review" | "temporary" | "drop";
};

type ExtractionResult = {
  conversation_summary_delta?: string;
  memory_candidates?: ExtractedCandidate[];
};

function formatBatch(messages: ChatMessage[]): string {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message, index) => {
      const role = message.role === "user" ? "User" : "Assistant";
      return `${index + 1}. ${role}: ${message.content.trim()}`;
    })
    .filter((line) => line.length > 12)
    .join("\n\n");
}

function extractJson(text: string): ExtractionResult | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as ExtractionResult;
  } catch {
    return null;
  }
}

function clampImportance(value: unknown): 1 | 2 | 3 | 4 | 5 {
  const n = Math.round(Number(value));
  return Math.max(1, Math.min(5, Number.isFinite(n) ? n : 3)) as 1 | 2 | 3 | 4 | 5;
}

function clampConfidence(value: unknown): number {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));
}

function validPriority(value: unknown, importance: number): MemoryPriority {
  if (
    value === "permanent" ||
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "ephemeral"
  ) {
    return value;
  }
  if (importance >= 5) return "permanent";
  if (importance >= 4) return "high";
  if (importance <= 1) return "ephemeral";
  if (importance === 2) return "low";
  return "medium";
}

function validType(value: unknown): MemoryNode["type"] {
  if (
    value === "preference" ||
    value === "project" ||
    value === "project_fact" ||
    value === "decision" ||
    value === "instruction" ||
    value === "summary" ||
    value === "task" ||
    value === "idea" ||
    value === "file_reference" ||
    value === "temporary_context"
  ) {
    return value;
  }
  return "summary";
}

function validScope(value: unknown): MemoryNode["scope"] {
  if (value === "global" || value === "project" || value === "conversation" || value === "session") {
    return value;
  }
  return "conversation";
}

function expiresAtFor(priority: MemoryPriority, type: MemoryNode["type"]): string | undefined {
  if (priority !== "ephemeral" && type !== "temporary_context") return undefined;
  return new Date(Date.now() + EPHEMERAL_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function shouldExtractMemoryBatch(conversationId: string, now = Date.now()): boolean {
  const conversation = useChatStore.getState().conversations.find((c) => c.id === conversationId);
  if (!conversation) return false;
  const processed = conversation.memoryLastProcessedMessageCount ?? 0;
  const newMessages = conversation.messages.length - processed;
  if (newMessages < 2) return false;
  const batch = conversation.messages.slice(processed);
  const newExchanges = batch.filter((message) => message.role === "user").length;
  if (newMessages >= MIN_NEW_MESSAGES) return true;
  if (newExchanges >= MIN_NEW_EXCHANGES) return true;
  return Boolean(conversation.memoryPendingSince && now - conversation.memoryPendingSince >= MIN_PENDING_MS);
}

async function isLikelyDuplicate(candidate: ExtractedCandidate): Promise<boolean> {
  const query = `${candidate.title ?? ""} ${candidate.summary ?? ""} ${candidate.content ?? ""}`.trim();
  if (query.length < 12) return false;
  const matches = await searchMemory(query, { limit: 5 });
  const normalized = (candidate.content ?? candidate.summary ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return matches.some((node) => {
    const existing = `${node.title} ${node.summary} ${node.content}`.toLowerCase().replace(/\s+/g, " ");
    return normalized.length > 20 && existing.includes(normalized.slice(0, 80));
  });
}

function toCreateNode(
  candidate: ExtractedCandidate,
  options: { conversationId: string; sourceMessageIds: string[]; extractionBatchId: string },
): Omit<CreateMemoryNode, "id"> | null {
  const title = candidate.title?.trim();
  const content = candidate.content?.trim();
  if (!title || !content || candidate.retention === "drop") return null;

  const importance = clampImportance(candidate.importance);
  const confidence = clampConfidence(candidate.confidence);
  const priority = validPriority(candidate.priority, importance);
  const retention = candidate.retention ?? "review";
  const autoSave =
    retention === "keep" &&
    confidence >= 0.85 &&
    (priority === "permanent" || priority === "high") &&
    importance >= 4;

  const type = validType(candidate.type);

  return {
    folderId: "default",
    conversationId: options.conversationId,
    title,
    content,
    summary: candidate.summary?.trim() || content.slice(0, 180),
    type,
    scope: validScope(candidate.scope),
    tags: Array.isArray(candidate.tags) ? candidate.tags.filter((tag) => typeof tag === "string").slice(0, 8) : [],
    importance,
    confidence,
    priority,
    expiresAt: expiresAtFor(priority, type),
    sourceMessageIds: options.sourceMessageIds,
    extractionBatchId: options.extractionBatchId,
    origin: "auto_extracted",
    status: autoSave ? "active" : "needs_review",
    isPinned: priority === "permanent",
  };
}

export async function runMemoryExtractionBatch(options: {
  conversationId: string;
  providerId: string;
  model: string;
  force?: boolean;
  signal?: AbortSignal;
}): Promise<{ prompt?: string; output?: string } | void> {
  const store = useChatStore.getState();
  const conversation = store.conversations.find((c) => c.id === options.conversationId);
  if (!conversation || options.signal?.aborted) return;

  const start = options.force
    ? Math.max(0, conversation.messages.length - MAX_BATCH_MESSAGES)
    : conversation.memoryLastProcessedMessageCount ?? 0;
  const end = conversation.messages.length;
  if (end - start < 2) return;

  const batch = conversation.messages.slice(Math.max(start, end - MAX_BATCH_MESSAGES), end);
  const transcript = formatBatch(batch);
  if (!transcript) {
    store.setMemoryProcessed(options.conversationId, end);
    return;
  }

  const adapter = getProviderAdapter(options.providerId);
  if (!adapter) return;

  const userContent = buildMemoryExtractionUserMessage({
    title: conversation.title,
    transcript,
  });
  const fullPrompt = `${MEMORY_EXTRACTION_SYSTEM}\n\n---\n\n${userContent}`;
  const raw = await new Promise<string>((resolve) => {
    let output = "";
    adapter
      .sendChat({
        model: options.model,
        messages: [
          { id: "memory-extraction-system", role: "system", content: MEMORY_EXTRACTION_SYSTEM, timestamp: 0 },
          { id: crypto.randomUUID(), role: "user", content: userContent, timestamp: Date.now() },
        ],
        signal: options.signal,
        temperature: 0.2,
        onChunk: (chunk) => {
          output += chunk;
        },
        onReasoningChunk: () => {},
        onError: () => resolve(""),
        onComplete: () => resolve(output),
      })
      .catch(() => resolve(""));
  });

  if (options.signal?.aborted) return;

  const parsed = extractJson(raw);
  const candidates = parsed?.memory_candidates ?? [];
  const extractionBatchId = crypto.randomUUID();
  const sourceMessageIds = batch.map((message) => message.id);

  let createdCount = 0;
  for (const candidate of candidates.slice(0, 8)) {
    if (options.signal?.aborted) return;
    const node = toCreateNode(candidate, {
      conversationId: options.conversationId,
      sourceMessageIds,
      extractionBatchId,
    });
    if (!node) continue;
    if (await isLikelyDuplicate(candidate)) continue;
    await createMemoryNode(node);
    createdCount += 1;
  }

  const summaryFallback = parsed?.conversation_summary_delta?.trim();
  if (options.force && createdCount === 0 && summaryFallback && summaryFallback.length > 30) {
    await createMemoryNode({
      folderId: "default",
      conversationId: options.conversationId,
      title: `Conversation memory: ${conversation.title}`.slice(0, 80),
      content: summaryFallback,
      summary: summaryFallback.slice(0, 180),
      type: "summary",
      scope: "conversation",
      tags: ["manual-extraction", "conversation-summary"],
      importance: 3,
      confidence: 0.65,
      priority: "medium",
      sourceMessageIds,
      extractionBatchId,
      origin: "auto_extracted",
      status: "needs_review",
    });
    createdCount += 1;
  }

  if (createdCount > 0) {
    await useMemoryStore.getState().hydrateMemory();
  }

  useChatStore.getState().setMemoryProcessed(options.conversationId, end);

  const summaryDelta = parsed?.conversation_summary_delta?.trim();
  const parts: string[] = [];
  if (createdCount > 0) parts.push(`${createdCount} memor${createdCount === 1 ? "y" : "ies"} extracted`);
  if (summaryDelta) parts.push(`Summary updated`);
  if (parts.length === 0) parts.push("No new memories");
  return { prompt: fullPrompt, output: parts.join(" · ") };
}
