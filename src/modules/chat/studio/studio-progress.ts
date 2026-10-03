import type { ChatMessage } from "@/modules/chat/chat-types";

export function studioProgressLabel(message?: ChatMessage): string {
  const tool = message?.toolStates?.findLast((item) => item.phase === "pending" || item.phase === "running" || item.phase === "retrying");
  if (tool) {
    if (tool.name === "ask_question") return "Waiting for your answer";
    if (tool.mcpApproval) return "Waiting for permission";
    if (tool.phase === "retrying") return `Retrying ${tool.label.toLowerCase()}`;
    if (tool.detail === "Opening the view") return "Opening the view";
    if (tool.name === "studio_render") return tool.phase === "pending" ? "Preparing the view" : "Building the view";
    if (tool.name === "studio_update") return "Updating the view";
    if (tool.name === "web_search") return "Gathering sources";
    return tool.label;
  }
  if (message?.content.trim()) return "Writing the response";
  if (message?.reasoning?.trim()) return "Thinking through your request";
  return "Waiting for the model";
}
