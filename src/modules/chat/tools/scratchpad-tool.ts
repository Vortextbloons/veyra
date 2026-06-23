import type { ProviderToolCall } from "@/lib/providers/types";
import { SCRATCHPAD_TOOL_NAME } from "@/lib/tool-registry";
import { stringArg } from "@/modules/chat/chat-tool-utils";
import { getToolCallUi } from "@/lib/tool-call-ui";
import { useChatStore } from "@/stores/chat-store";

export function executeScratchpadCall(
  call: ProviderToolCall,
  conversationId: string,
  messageId: string,
): string {
  const chatStore = useChatStore.getState();
  const label = getToolCallUi(SCRATCHPAD_TOOL_NAME).label;
  const content = stringArg(call.arguments, "content");

  chatStore.setStreamingToolState({
    id: call.id,
    name: call.name,
    label,
    phase: "running",
    input: content.length > 120 ? content.slice(0, 120) + "…" : content,
  });

  if (!content) {
    const error = "Invalid scratchpad_write tool arguments: missing content.";
    chatStore.setStreamingToolState({
      id: call.id,
      name: call.name,
      label,
      phase: "error",
      error,
    });
    return `Tool result for ${SCRATCHPAD_TOOL_NAME}: ${error}`;
  }

  chatStore.appendToScratchpad(conversationId, messageId, content);

  chatStore.setStreamingToolState({
    id: call.id,
    name: call.name,
    label,
    phase: "done",
    input: `${content.length} chars saved`,
  });

  return `Tool result for ${SCRATCHPAD_TOOL_NAME}: Notes saved to scratchpad.`;
}
