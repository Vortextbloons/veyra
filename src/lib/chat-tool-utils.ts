import type { ProviderToolCall } from "@/lib/providers/types";
import { getToolCallUi } from "@/lib/tool-call-ui";
import { useChatStore } from "@/stores/chat-store";
import type { DocCreateIntent, DocReadIntent, DocUpdateIntent, DocumentType } from "@/modules/documents/document-types";

export function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

export function docCreateIntentFromToolCall(call: ProviderToolCall): DocCreateIntent | null {
  const title = stringArg(call.arguments, "title");
  const documentType = stringArg(call.arguments, "documentType") as DocumentType;
  const contentMarkdown = stringArg(call.arguments, "contentMarkdown");
  if (!title || !documentType || !contentMarkdown) return null;
  return { type: "doc.create", title, documentType, contentMarkdown };
}

export function docUpdateIntentFromToolCall(call: ProviderToolCall): DocUpdateIntent | null {
  const documentId = stringArg(call.arguments, "documentId");
  const mode = stringArg(call.arguments, "mode") as DocUpdateIntent["mode"];
  const contentMarkdown = stringArg(call.arguments, "contentMarkdown");
  const target = stringArg(call.arguments, "target");
  if (!documentId || !mode || !contentMarkdown) return null;
  return { type: "doc.update", documentId, mode, contentMarkdown, target: target || undefined };
}

export function docReadIntentFromToolCall(call: ProviderToolCall): DocReadIntent | null {
  const documentId = stringArg(call.arguments, "documentId");
  if (!documentId) return null;
  return { type: "doc.read", documentId };
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

export function summarizePythonExecutionResult(result: {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}): string {
  if (result.timedOut) {
    return `Timed out after ${Math.round(result.durationMs / 1000)}s`;
  }
  if (result.exitCode !== 0) {
    return `Exited with code ${result.exitCode ?? "unknown"}`;
  }

  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  if (stdout && stderr) return "Exited 0 · stdout and stderr captured";
  if (stderr) return "Exited 0 · stderr captured";
  if (stdout) return stdout.length > 120 ? "Exited 0 · output captured" : `Exited 0 · ${stdout}`;
  return "Exited 0 · no output";
}

export function formatPythonExecutionSection(result: {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  pythonPath: string;
  durationMs: number;
  workingDirectory: string;
}): string {
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();

  return [
    `Python: ${result.pythonPath}`,
    `Working directory: ${result.workingDirectory}`,
    `Duration: ${result.durationMs} ms`,
    `Exit code: ${result.exitCode ?? "unknown"}${result.timedOut ? " (timed out)" : ""}`,
    stdout ? `Stdout:\n${stdout}` : "Stdout: (empty)",
    stderr ? `Stderr:\n${stderr}` : "Stderr: (empty)",
  ].join("\n\n");
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
