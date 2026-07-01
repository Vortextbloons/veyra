import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) => {
    if (command === "load_conversations") return "{not-json";
    if (command === "load_or_create_conversation_key") return "";
    return undefined;
  }),
}));

vi.mock("@/workers/conversation-decrypt.worker?worker", () => ({
  default: class {
    constructor() {
      throw new Error("worker unavailable");
    }
  },
}));

vi.mock("@/workers/conversation-encrypt.worker?worker", () => ({
  default: class {
    constructor() {
      throw new Error("worker unavailable");
    }
  },
}));

describe("conversation-storage", () => {
  it("falls back to an empty snapshot when persisted conversations cannot be decoded", async () => {
    const { loadConversationSnapshot } = await import("@/lib/conversation-storage");

    await expect(loadConversationSnapshot()).resolves.toEqual([]);
  });
});
