import type { ProviderToolCall } from "@/lib/providers/types";
import { CODE_EXEC_TOOL_NAME } from "@/lib/tool-registry";
import {
  stringArg,
  stripPythonCodeFence,
  summarizeCodeSnippet,
} from "@/modules/chat/chat-tool-utils";
import { getToolCallUi } from "@/lib/tool-call-ui";
import { useChatStore } from "@/stores/chat-store";

export type CodeExecutionSettings = {
  timeoutSecs: number;
  pythonPath: string | null;
  workspaceRoot: string | null;
};

export async function executeCodeExecutionCall(
  call: ProviderToolCall,
  _settings: CodeExecutionSettings,
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

  const error = "Native code execution is disabled until an OS-enforced sandbox is available.";
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
