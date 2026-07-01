import type { ProviderToolCall } from "@/lib/providers/types";
import { CODE_EXEC_TOOL_NAME } from "@/lib/tool-registry";
import {
  stringArg,
  stripPythonCodeFence,
  summarizeCodeSnippet,
  formatPythonExecutionSection,
  summarizePythonExecutionResult,
} from "@/modules/chat/chat-tool-utils";
import { invokeExecutePythonCode } from "@/lib/code-execution";
import { getToolCallUi } from "@/lib/tool-call-ui";
import { useChatStore } from "@/stores/chat-store";

export type CodeExecutionSettings = {
  timeoutSecs: number;
  pythonPath: string | null;
  workspaceRoot: string | null;
};

export async function executeCodeExecutionCall(
  call: ProviderToolCall,
  settings: CodeExecutionSettings,
): Promise<string> {
  const chatStore = useChatStore.getState();
  const label = getToolCallUi(CODE_EXEC_TOOL_NAME).label;
  const rawCode = stringArg(call.arguments, "code");
  const code = stripPythonCodeFence(rawCode);
  const inputPreview = summarizeCodeSnippet(code);

  chatStore.setStreamingToolState({
    id: call.id,
    name: call.name,
    label,
    phase: "running",
    input: inputPreview,
  });

  if (!code) {
    const error = "Invalid code_execution tool arguments.";
    chatStore.setStreamingToolState({
      id: call.id,
      name: call.name,
      label,
      phase: "error",
      input: inputPreview,
      error,
    });
    return `Tool result for ${CODE_EXEC_TOOL_NAME}: ${error}`;
  }

  try {
    const result = await invokeExecutePythonCode({
      code,
      timeoutSecs: settings.timeoutSecs,
      pythonPath: settings.pythonPath,
      workspaceRoot: settings.workspaceRoot,
    });
    const summary = summarizePythonExecutionResult(result);
    const detail = [`Code:\n${code}`, formatPythonExecutionSection(result)].join("\n\n");
    const phase = result.exitCode === 0 && !result.timedOut ? "done" : "error";

    chatStore.setStreamingToolState({
      id: call.id,
      name: call.name,
      label,
      phase,
      input: inputPreview,
      detail,
      result: { code, ...result },
      ...(phase === "error" ? { error: summary } : {}),
    });

    return `Tool result for ${CODE_EXEC_TOOL_NAME}(python code):\n\n${formatPythonExecutionSection(result)}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    chatStore.setStreamingToolState({
      id: call.id,
      name: call.name,
      label,
      phase: "error",
      input: inputPreview,
      error: message,
    });
    return `Tool result for ${CODE_EXEC_TOOL_NAME}: ${message}`;
  }
}
