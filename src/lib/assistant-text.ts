import type { ChatMessage } from "@/lib/chat-types";

/** Text usable for titles/summaries — reasoning models often put the reply in `reasoning`. */
export function getAssistantVisibleText(message: ChatMessage | undefined): string {
  if (!message) return "";
  const content = message.content?.trim() ?? "";
  if (content) return content;
  return message.reasoning?.trim() ?? "";
}
