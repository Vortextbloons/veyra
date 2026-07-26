import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/modules/chat/chat-types";

vi.mock("@/modules/chat/components/tool-call-indicator", () => ({
  ToolCallIndicator: ({ state }: { state: { label: string; phase: string } }) => (
    <div>{state.label}: {state.phase}</div>
  ),
}));

vi.mock("@/modules/chat/components/web-search-block", () => ({
  WebSearchToolCallBlock: () => <div>Web search round</div>,
}));

vi.mock("@/modules/chat/components/code-execution-block", () => ({
  CodeExecutionBlock: () => <div>Code execution</div>,
}));

vi.mock("@/modules/chat/components/scratchpad-block", () => ({
  ScratchpadBlock: () => <div>Scratchpad</div>,
}));

vi.mock("@/modules/chat/components/ask-question-block", () => ({
  AskQuestionBlock: () => <div>Question</div>,
}));

import { ToolCallList } from "@/modules/chat/components/tool-call-list";

describe("tool call activity", () => {
  it("shows a detected web search before its search round has been initialized", () => {
    const message: ChatMessage = {
      id: "assistant-1",
      role: "assistant",
      content: "",
      timestamp: 1,
      toolStates: [{
        id: "search-1",
        name: "web_search",
        label: "Web Search",
        phase: "pending",
      }],
    };

    const markup = renderToStaticMarkup(<ToolCallList message={message} />);

    expect(markup).toContain("Web Search: pending");
  });
});
