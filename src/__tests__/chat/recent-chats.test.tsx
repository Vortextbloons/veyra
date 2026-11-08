import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecentChats } from "@/components/recent-chats";

describe("RecentChats working indicator", () => {
  it("marks only the chat where the model is working", () => {
    const html = renderToStaticMarkup(
      <RecentChats
        chats={[
          { id: "pi:1", title: "Running chat", meta: "Working", working: true },
          { id: "conv-2", title: "Idle chat", meta: "1/2/2026", working: false },
        ]}
        activeId="pi:1"
      />,
    );

    expect(html).toContain("Model is working in Running chat");
    expect(html).not.toContain("Model is working in Idle chat");
  });

  it("renders no chat-row icon when nothing is working", () => {
    const html = renderToStaticMarkup(
      <RecentChats chats={[{ id: "conv-1", title: "Quiet chat", meta: "1/2/2026" }]} />,
    );

    expect(html).not.toContain("Model is working");
    expect(html).not.toContain("lucide-message-square");
  });
});
