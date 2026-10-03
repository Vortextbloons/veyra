import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChatMessage, ToolCallState } from "@/modules/chat/chat-types";
import { studioProgressLabel } from "@/modules/chat/studio/studio-progress";
import { StudioGenerationProgress } from "@/modules/chat/studio/components/studio-generation-progress";

const message = (patch: Partial<ChatMessage> = {}): ChatMessage => ({ id: "answer", role: "assistant", timestamp: 1, content: "", ...patch });
const tool = (patch: Partial<ToolCallState> = {}): ToolCallState => ({ id: "view", name: "studio_render", label: "Studio environment", phase: "pending", ...patch });

describe("Studio progress", () => {
  it("distinguishes waiting for the model from received reasoning and text", () => {
    expect(studioProgressLabel()).toBe("Waiting for the model");
    expect(studioProgressLabel(message({ reasoning: "   " }))).toBe("Waiting for the model");
    expect(studioProgressLabel(message({ reasoning: "Consider the layout" }))).toBe("Thinking through your request");
    expect(studioProgressLabel(message({ reasoning: "Consider the layout", content: "Here is the view" }))).toBe("Writing the response");
  });
  it("prioritizes active tools over text and completed work", () => {
    expect(studioProgressLabel(message({ content: "Building", toolStates: [tool(), tool({ id: "search", name: "web_search", phase: "done" })] }))).toBe("Preparing the view");
    expect(studioProgressLabel(message({ toolStates: [tool({ phase: "running" })] }))).toBe("Building the view");
    expect(studioProgressLabel(message({ toolStates: [tool({ phase: "running", detail: "Opening the view" })] }))).toBe("Opening the view");
    expect(studioProgressLabel(message({ toolStates: [tool({ name: "studio_update", phase: "running" })] }))).toBe("Updating the view");
    expect(studioProgressLabel(message({ toolStates: [tool({ name: "web_search", phase: "running" })] }))).toBe("Gathering sources");
  });
  it("shows when user input or a retry is required", () => {
    expect(studioProgressLabel(message({ toolStates: [tool({ name: "ask_question", phase: "running" })] }))).toBe("Waiting for your answer");
    expect(studioProgressLabel(message({ toolStates: [tool({ phase: "retrying" })] }))).toBe("Retrying studio environment");
    expect(studioProgressLabel(message({ toolStates: [tool({ name: "mcp_tool", mcpApproval: { serverId: "fixture", toolName: "read" } })] }))).toBe("Waiting for permission");
  });
  it("renders activity immediately before any tokens arrive", () => {
    const html = renderToStaticMarkup(createElement(StudioGenerationProgress, { compact: false, onConversation: () => {} }));
    expect(html).toContain("Waiting for the model");
    expect(html).toContain("Model activity and tool steps will appear here");
    expect(html).toContain('aria-expanded="true"');
  });
  it("exposes reasoning, tool failures, and the path to answer questions", () => {
    const html = renderToStaticMarkup(createElement(StudioGenerationProgress, { compact: false, onConversation: () => {}, message: message({ reasoning: "Compare both options", toolStates: [tool({ phase: "error", error: "View validation failed" }), tool({ id: "question", name: "ask_question", label: "Question", phase: "running" })] }) }));
    expect(html).toContain("Compare both options");
    expect(html).toContain("View validation failed");
    expect(html).toContain("Open conversation to continue");
  });
  it("starts collapsed over an existing view", () => {
    const html = renderToStaticMarkup(createElement(StudioGenerationProgress, { compact: true, onConversation: () => {}, message: message({ reasoning: "Compare both options" }) }));
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Compare both options");
  });
});
