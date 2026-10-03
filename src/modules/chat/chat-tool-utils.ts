import type { ProviderToolCall } from "@/lib/providers/types";
import { getToolCallUi } from "@/lib/tool-call-ui";
import { useChatStore } from "@/stores/chat-store";

export function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

export function stripPythonCodeFence(code: string): string {
  const trimmed = code.trim();
  const fenced = trimmed.match(/^```(?:python3?|py)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
  if (fenced) return fenced[1].trim();

  const inlineFenced = trimmed.match(/^```(?:python3?|py)?\s*([\s\S]*?)```$/i);
  if (inlineFenced) return inlineFenced[1].trim();

  return trimmed;
}

export function summarizeCodeSnippet(code: string, maxLength = 120): string {
  const oneLine = code.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLength) return oneLine;
  return `${oneLine.slice(0, maxLength - 1)}…`;
}

export function registerStreamingToolCall(
  call: Pick<ProviderToolCall, "id" | "name">,
  phase: "pending" | "running",
  input?: string,
) {
  const meta = getToolCallUi(call.name);
  useChatStore.getState().setStreamingToolState({
    id: call.id,
    name: call.name,
    label: meta.label,
    phase,
    input,
  });
}

export function registerStreamingToolCalls(
  calls: ProviderToolCall[],
  phase: "pending" | "running",
  inputForCall?: (call: ProviderToolCall) => string | undefined,
) {
  for (const call of calls) {
    registerStreamingToolCall(call, phase, inputForCall?.(call));
  }
}
