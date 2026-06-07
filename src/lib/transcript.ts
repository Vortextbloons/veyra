import type { ChatMessage } from "@/lib/chat-types";

export function formatTranscript(messages: ChatMessage[]): string {
  return messages
    .map((msg) => {
      const label =
        msg.role === "user" ? "User" : msg.role === "assistant" ? "Assistant" : "System";
      return `${label}: ${msg.content.trim()}`;
    })
    .filter((line) => line.length > 12)
    .join("\n\n");
}
