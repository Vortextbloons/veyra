// ── AI assist orchestrator ───────────────────────────────────────────────────
//
// Wraps the active provider's sendChat for assist actions. Streams chunks
// back to a consumer via a callback. Tolerates the model returning partial
// JSON or a refusal object.

import { getProviderAdapter } from "@/lib/providers";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import { newId } from "@/lib/id";
import { buildUserMessage, systemPromptForAction } from "./ai-assist-prompts";
import type {
  CharacterAssistAction,
  CharacterAssistChunk,
  CharacterAssistRequest,
  CharacterAssistResult,
} from "./ai-assist-types";
import type {
  CharacterLorebookEntry,
  CharacterRecord,
} from "../character-types";

export interface RunAssistOptions {
  request: CharacterAssistRequest;
  character?: CharacterRecord;
  paragraph?: string;
  selectedEntries?: CharacterLorebookEntry[];
  userPrompt?: string;
  onChunk: (chunk: CharacterAssistChunk) => void;
  signal?: AbortSignal;
}

const ASSIST_CONTEXT_LENGTH = 8192;

function resolveModel(requested: string | undefined): string {
  const configured = useSettingsStore.getState().characterAssistModel?.trim();
  const fallback = useProviderStore.getState().selectedModel;
  if (configured) return configured;
  if (requested && requested.length > 0) return requested;
  return fallback;
}

function resolveMaxTokens(): number {
  const n = useSettingsStore.getState().characterAssistMaxTokens;
  if (typeof n === "number" && n > 0) return Math.min(4000, Math.max(256, n));
  return 1500;
}

function shouldSendContext(request: CharacterAssistRequest): boolean {
  if (request.options?.sendCurrentContext !== undefined) {
    return request.options.sendCurrentContext;
  }
  return useSettingsStore.getState().characterAssistSendContext;
}

function buildPrimingContext(character: CharacterRecord | undefined): string {
  if (!character) return "";
  const trimmed: Record<string, unknown> = {
    name: character.name,
    title: character.title,
    tagline: character.tagline,
    description: character.description,
    personality: character.personality,
    scenario: character.scenario,
    firstMessage: character.firstMessage,
    alternateGreetings: character.alternateGreetings,
    systemPrompt: character.systemPrompt,
    postHistoryInstructions: character.postHistoryInstructions,
    exampleMessages: character.exampleMessages,
    tags: character.tags,
    category: character.category,
  };
  return `<veyra_character_context>
Current character record (do not change unless the user asks; use as priming context only):
${JSON.stringify(trimmed, null, 2)}
</veyra_character_context>`;
}

/**
 * Try to find a complete JSON object in a string. Returns the parsed value
 * and the substring up to its end, or null if not found.
 */
function extractFirstJsonObject(text: string): { value: unknown; end: number } | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = text.slice(start, i + 1);
        try {
          return { value: JSON.parse(candidate), end: i + 1 };
        } catch {
          // Try again from the next opening brace
          start = -1;
        }
      }
    }
  }
  return null;
}

function parseAssistOutput(
  raw: string,
  action: CharacterAssistAction,
): CharacterAssistResult | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strip <think>...</think> blocks before parsing.
  const cleaned = trimmed
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  if (!cleaned) return null;

  // Try direct parse first.
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const extracted = extractFirstJsonObject(cleaned);
    if (extracted) parsed = extracted.value;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.refusal === "string") {
    return { card: null, text: obj.refusal, warnings: ["refusal"] };
  }

  switch (action) {
    case "generate": {
      const card = (obj.card as Record<string, unknown> | undefined) ?? {};
      return {
        card: card as Partial<CharacterRecord>,
        lorebookEntries: Array.isArray(obj.lorebookEntries)
          ? (obj.lorebookEntries as CharacterLorebookEntry[])
          : undefined,
        warnings: Array.isArray(obj.warnings)
          ? (obj.warnings as string[])
          : undefined,
      };
    }
    case "rewrite":
    case "expand":
    case "condense": {
      const value = typeof obj.value === "string" ? obj.value : "";
      const field = typeof obj.field === "string" ? obj.field : "";
      if (!field || !value) return { card: null, text: cleaned };
      return {
        card: { [field]: value } as Partial<CharacterRecord>,
        warnings: Array.isArray(obj.warnings)
          ? (obj.warnings as string[])
          : undefined,
      };
    }
    case "suggest_greetings": {
      return {
        card: null,
        text: cleaned,
        warnings: Array.isArray(obj.warnings)
          ? (obj.warnings as string[])
          : undefined,
        lorebookEntries: undefined,
      };
    }
    case "suggest_examples": {
      const examples = Array.isArray(obj.examples)
        ? (obj.examples as unknown[]) as Array<{ user: string; assistant: string }>
        : [];
      return {
        card: { exampleMessages: examples } as unknown as Partial<CharacterRecord>,
        warnings: Array.isArray(obj.warnings)
          ? (obj.warnings as string[])
          : undefined,
      };
    }
    case "suggest_tags": {
      const tags = Array.isArray(obj.tags)
        ? (obj.tags as unknown[]).filter((t) => typeof t === "string") as string[]
        : [];
      return {
        card: { tags } as unknown as Partial<CharacterRecord>,
        warnings: Array.isArray(obj.warnings)
          ? (obj.warnings as string[])
          : undefined,
      };
    }
    case "suggest_lorebook": {
      const entries = Array.isArray(obj.entries)
        ? (obj.entries as CharacterLorebookEntry[])
        : [];
      return {
        card: null,
        lorebookEntries: entries,
        warnings: Array.isArray(obj.warnings)
          ? (obj.warnings as string[])
          : undefined,
      };
    }
    case "suggest_keys": {
      return {
        card: null,
        warnings: Array.isArray(obj.warnings)
          ? (obj.warnings as string[])
          : undefined,
      };
    }
    case "merge_lorebook": {
      const entries = Array.isArray(obj.entries)
        ? (obj.entries as CharacterLorebookEntry[])
        : [];
      return {
        card: null,
        lorebookEntries: entries,
        warnings: Array.isArray(obj.warnings)
          ? (obj.warnings as string[])
          : undefined,
      };
    }
    case "director_turn": {
      const reply = typeof obj.reply === "string" ? obj.reply : "";
      const cardPatch = (obj.cardPatch as Record<string, unknown> | undefined) ?? {};
      const lorebookPatch = (obj.lorebookPatch as
        | {
            add?: CharacterLorebookEntry[];
            update?: Array<{ id: string; changes: Record<string, unknown> }>;
            remove?: string[];
          }
        | undefined) ?? {};
      return {
        card: cardPatch as Partial<CharacterRecord>,
        lorebookEntries: lorebookPatch.add,
        text: reply,
        warnings: Array.isArray(obj.warnings)
          ? (obj.warnings as string[])
          : undefined,
      };
    }
    default:
      return { card: null, text: cleaned };
  }
}

export async function runCharacterAssist(
  options: RunAssistOptions,
): Promise<CharacterAssistResult> {
  const { request, onChunk } = options;
  const providerId = useProviderStore.getState().selectedProvider;
  const adapter = getProviderAdapter(providerId);
  if (!adapter) {
    onChunk({ kind: "error", error: "No active AI provider. Connect a provider first." });
    throw new Error("no provider");
  }

  const model = resolveModel(undefined);
  if (!model) {
    onChunk({ kind: "error", error: "No model selected for AI assist." });
    throw new Error("no model");
  }

  const system = systemPromptForAction(request.action);
  const userMsg = buildUserMessage(request, {
    character: options.character,
    paragraph: options.paragraph,
    selectedEntries: options.selectedEntries,
    userPrompt: options.userPrompt,
  });
  const sendContext = shouldSendContext(request);
  const priming = sendContext && options.character
    ? buildPrimingContext(options.character)
    : "";
  const finalUser = priming ? `${priming}\n\n${userMsg}` : userMsg;

  let buffer = "";
  const startedAt = Date.now();

  onChunk({ kind: "status", message: "Sending request…" });

  try {
    await adapter.sendChat({
      model,
      messages: [
        {
          id: newId("assist-sys"),
          role: "system",
          content: system,
          timestamp: 0,
        },
        {
          id: newId("assist-usr"),
          role: "user",
          content: finalUser,
          timestamp: Date.now(),
        },
      ],
      temperature: 0.7,
      contextLength: ASSIST_CONTEXT_LENGTH,
      maxTokens: resolveMaxTokens(),
      signal: options.signal,
      onChunk: (chunk) => {
        if (!chunk) return;
        buffer += chunk;
        onChunk({ kind: "text", value: buffer });
      },
      onReasoningChunk: () => {
        // ignore reasoning text for the assist flow
      },
      onError: (err) => {
        onChunk({ kind: "error", error: err });
      },
      onComplete: () => {
        // final parse happens below
      },
    });
  } catch (err) {
    if (options.signal?.aborted) {
      onChunk({ kind: "status", message: "Cancelled." });
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    onChunk({ kind: "error", error: msg });
    throw new Error(`AI assist failed: ${msg}`, { cause: err });
  }

  if (options.signal?.aborted) {
    throw new DOMException("aborted", "AbortError");
  }

  // Refusal pass: scan the buffered output for {"refusal": "..."}
  const lower = buffer.toLowerCase();
  const refusalMatch = lower.indexOf('"refusal"');
  if (refusalMatch !== -1) {
    const result = parseAssistOutput(buffer, request.action);
    if (result && result.warnings?.includes("refusal")) {
      const refusalText = result.text ?? "Model refused this request.";
      onChunk({
        kind: "done",
        message: "Refused.",
        usage: {
          tokensIn: undefined,
          tokensOut: undefined,
        },
      });
      return {
        card: null,
        text: refusalText,
        warnings: ["refusal"],
      };
    }
  }

  const parsed = parseAssistOutput(buffer, request.action);
  if (!parsed) {
    onChunk({
      kind: "error",
      error: "Model output could not be parsed. Try again or edit manually.",
    });
    throw new Error("parse_failed");
  }

  onChunk({ kind: "done", message: "Done." });
  void startedAt;
  return parsed;
}

export function createEmptyResult(): CharacterAssistResult {
  return { card: null, warnings: [], text: "" };
}
