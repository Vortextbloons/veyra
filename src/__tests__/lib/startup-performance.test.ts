import { expect, it, vi } from "vitest";
import { encryptConversationsPayload, importConversationKey } from "@/lib/conversation-crypto";

const fixture = vi.hoisted(() => ({ primary: "", backup: "", saves: 0, conversations: [] as unknown[], sessions: [] as unknown[] }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async (command: string) => command === "load_conversation_snapshots" ? { primary: fixture.primary, backup: fixture.backup } : command === "load_or_create_conversation_key" ? "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" : undefined) }));
vi.mock("@/workers/conversation-decrypt.worker?worker", () => ({ default: class { constructor() { throw new Error("benchmark uses crypto fallback"); } } }));
vi.mock("@/workers/conversation-encrypt.worker?worker", () => ({ default: class { constructor() { throw new Error("benchmark uses crypto fallback"); } } }));
vi.mock("@/stores/chat-store", () => ({ useChatStore: { getState: () => ({ conversations: fixture.conversations }), setState: (state: { conversations: unknown[] }) => { fixture.conversations = state.conversations; } } }));
vi.mock("@/modules/agents/agent-store", () => ({ useAgentStore: { getState: () => ({ sessions: fixture.sessions }), setState: (state: { sessions: unknown[] }) => { fixture.sessions = state.sessions; }, subscribe: () => () => undefined } }));

it.skipIf(!process.env.VEYRA_STARTUP_BENCHMARK)("measures synthetic history decryption and Pi restoration", async () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
  const conversations = Array.from({ length: 200 }, (_, i) => ({
    id: `chat-${i}`, title: "Synthetic benchmark", createdAt: 1, updatedAt: 2,
    messages: Array.from({ length: 40 }, (_, j) => ({ id: `message-${j}`, role: j % 2 ? "assistant" : "user", content: "Synthetic content. ".repeat(30), timestamp: j })),
    agentSession: { id: `chat-${i}`, runtime: "pi", mode: "chat", status: "stopped", projectPath: "", prompt: "Test", title: "Synthetic benchmark", model: "test", startedAt: 1,
      events: Array.from({ length: 40 }, (_, j) => ({ id: `event-${j}`, type: j % 2 ? "output" : "status", title: j % 2 ? "Pi" : "Prompt", detail: "Synthetic content. ".repeat(30), at: j })) },
  }));
  const key = await importConversationKey(new Uint8Array(32).buffer, ["encrypt"]);
  fixture.primary = await encryptConversationsPayload(conversations, key, 2);
  fixture.backup = await encryptConversationsPayload(conversations, key, 1);
  const decryptMs: number[] = [];
  const restoreMs: number[] = [];
  let startupSaves = 0;
  for (let run = 0; run < 7; run++) {
    vi.resetModules();
    const storage = await import("@/lib/conversation-storage");
    const started = performance.now();
    const loaded = await storage.loadConversationSnapshot();
    decryptMs.push(performance.now() - started);
    expect(loaded).toHaveLength(200);
    fixture.conversations = loaded;
    fixture.sessions = [];
    const save = vi.spyOn(storage, "saveConversationSnapshot").mockResolvedValue(undefined);
    const { initializePiConversations } = await import("@/modules/agents/pi-conversation-storage");
    const restoreStart = performance.now();
    initializePiConversations();
    restoreMs.push(performance.now() - restoreStart);
    expect(fixture.sessions).toHaveLength(200);
    startupSaves += save.mock.calls.length;
    save.mockRestore();
  }
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  process.stdout.write(JSON.stringify({ benchmark: "startup", runs: 7, conversations: 200, messagesPerChat: 40, decryptMedianMs: median(decryptMs), restoreMedianMs: median(restoreMs), startupSaves }) + "\n");
}, 30000);
