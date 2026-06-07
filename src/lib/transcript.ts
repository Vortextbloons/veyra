import type { ChatMessage } from "@/lib/chat-types";

export function formatTranscript(messages: ChatMessage[]): string {
  return messages
    .map((msg) => {
      const content = msg.content.trim();
      if (!content) return "";
      const label =
        msg.role === "user" ? "User" : msg.role === "assistant" ? "Assistant" : "System";
      return `${label}: ${content}`;
    })
    .filter(Boolean)
    .join("\n\n");
}
