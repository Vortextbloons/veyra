import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StudioResponse } from "@/modules/chat/studio/studio-types";

vi.mock("@/stores/chat-store", () => ({
  useChatStore: Object.assign(vi.fn(), {
    getState: () => ({
      selectStudioResponseRevision: vi.fn(),
      undoStudioResponseRevision: vi.fn(),
    }),
  }),
}));

vi.mock("@/modules/chat/studio/studio-export", () => ({
  exportStudioRevisionToFile: vi.fn(),
}));

import { StudioResponseView } from "@/modules/chat/studio/components/studio-response";

function response(overrides: Partial<StudioResponse> = {}): StudioResponse {
  return {
    id: "response-1",
    title: "Release board",
    currentRevision: 1,
    latestRevision: 1,
    revisions: [{
      revision: 1,
      title: "Release board",
      html: "<main>Safe visual</main>",
      css: "main{display:grid}",
      createdAt: 1,
    }],
    status: "ready",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("inline Studio response", () => {
  it("keeps the sandbox, permission, referrer, title, and bounded frame contract", () => {
    const markup = renderToStaticMarkup(
      <StudioResponseView conversationId="conversation-1" assistantMessageId="assistant-1" response={response()} />,
    );

    expect(markup).toContain("sandbox=\"\"");
    expect(markup).toContain("referrerPolicy=\"no-referrer\"");
    expect(markup).toContain("camera &#x27;none&#x27;");
    expect(markup).toContain("title=\"Release board\"");
    expect(markup).toContain("h-[clamp(420px,68vh,820px)]");
  });

  it("retains the selected valid frame while reporting a rejected newer render", () => {
    const markup = renderToStaticMarkup(
      <StudioResponseView
        conversationId="conversation-1"
        assistantMessageId="assistant-1"
        response={response({
          status: "rejected",
          error: [{ code: "html_script_forbidden", message: "Scripts are not allowed." }],
        })}
      />,
    );

    expect(markup).toContain("<iframe");
    expect(markup).toContain("Scripts are not allowed.");
    expect(markup).toContain("rejected");
  });

  it("renders a bounded message-local placeholder when no valid revision exists", () => {
    const markup = renderToStaticMarkup(
      <StudioResponseView
        conversationId="conversation-1"
        assistantMessageId="assistant-2"
        response={response({
          id: "response-2",
          currentRevision: 0,
          latestRevision: 0,
          revisions: [],
          status: "validating",
        })}
      />,
    );

    expect(markup).not.toContain("<iframe");
    expect(markup).toContain("Creating visual response");
    expect(markup).toContain("Studio response: Release board");
  });
});
