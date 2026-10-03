import type { ChatMessage, Conversation } from "@/modules/chat/chat-types";
import type { StudioEnvironment, StudioJsonObject, StudioJsonValue, StudioResponseRevision } from "./studio-types";

export const STUDIO_STATE_MAX_BYTES = 16 * 1024;
export const STUDIO_DATA_MAX_BYTES = 32 * 1024;

/** Reject unsafe keys, non-JSON values, deep structures, and oversized payloads. */
export function studioJson(value: unknown, maxBytes = STUDIO_STATE_MAX_BYTES): StudioJsonValue | undefined {
  let nodes = 0;
  const visit = (item: unknown, depth: number): boolean => {
    if (++nodes > 4000 || depth > 16) return false;
    if (item === null || typeof item === "boolean" || typeof item === "string") return true;
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item !== "object" || !item) return false;
    if (Array.isArray(item)) return item.every((child) => visit(child, depth + 1));
    if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) return false;
    return Object.entries(item).every(([key, child]) => !["__proto__", "constructor", "prototype"].includes(key) && visit(child, depth + 1));
  };
  try {
    if (!visit(value, 0)) return undefined;
    const serialized = JSON.stringify(value);
    if (new TextEncoder().encode(serialized).byteLength > maxBytes) return undefined;
    return JSON.parse(serialized) as StudioJsonValue;
  } catch { return undefined; }
}

export function studioJsonObject(value: unknown, maxBytes = STUDIO_STATE_MAX_BYTES): StudioJsonObject | undefined {
  const parsed = studioJson(value, maxBytes);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
}

export type StudioEnvironmentEntry = {
  key: string;
  messageId: string;
  responseId: string;
  revision: StudioResponseRevision;
};

export function studioEnvironmentEntries(messages: ChatMessage[]): StudioEnvironmentEntry[] {
  return messages.flatMap((message) => {
    const response = message.studioResponse;
    return message.role === "assistant" && response ? response.revisions.map((revision) => ({
      key: `${response.id}:${revision.revision}`, messageId: message.id, responseId: response.id, revision,
    })) : [];
  }).sort((a, b) => a.revision.createdAt - b.revision.createdAt);
}

export function selectedStudioEntry(conversation: Pick<Conversation, "messages" | "studioEnvironment">): StudioEnvironmentEntry | undefined {
  const entries = studioEnvironmentEntries(conversation.messages);
  const selection = conversation.studioEnvironment?.selection;
  return entries.find((entry) => entry.messageId === selection?.messageId && entry.revision.revision === selection.revision) ?? entries.at(-1);
}

export function normalizeStudioEnvironment(raw: unknown, messages: ChatMessage[]): StudioEnvironment | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as Partial<StudioEnvironment>;
  const state = studioJsonObject(input.state) ?? {};
  const entries = studioEnvironmentEntries(messages);
  const selection = entries.some((entry) => entry.messageId === input.selection?.messageId && entry.revision.revision === input.selection.revision)
    ? input.selection : undefined;
  const payload = studioJson(input.lastEvent?.payload);
  const lastEvent = typeof input.lastEvent?.name === "string" && input.lastEvent.name.length <= 80 && payload !== undefined
    ? { name: input.lastEvent.name, payload } : undefined;
  const feedback = entries.some((entry) => entry.messageId === input.feedback?.messageId && entry.revision.revision === input.feedback.revision) &&
    (input.feedback?.status === "ready" || input.feedback?.status === "error")
    ? { ...input.feedback, message: input.feedback.message?.slice(0, 500) } : undefined;
  return { state, selection, lastEvent, feedback };
}

/** Frame output is untrusted. The caller must also verify window source and channel. */
export function parseStudioBridgeMessage(raw: unknown):
  | { type: "connect" | "ready" }
  | { type: "error"; message: string }
  | { type: "state"; state: StudioJsonObject }
  | { type: "event"; name: string; payload: StudioJsonValue }
  | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  if (value.type === "connect" || value.type === "ready") return { type: value.type };
  if (value.type === "error" && typeof value.message === "string") return { type: "error", message: value.message.slice(0, 500) };
  if (value.type === "state") {
    const state = studioJsonObject(value.state);
    return state ? { type: "state", state } : undefined;
  }
  if (value.type === "event" && typeof value.name === "string" && /^[\w .:-]{1,80}$/.test(value.name)) {
    const payload = studioJson(value.payload);
    return payload !== undefined ? { type: "event", name: value.name, payload } : undefined;
  }
  return undefined;
}
