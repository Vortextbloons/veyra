import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  key: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
  primary: null as string | null,
  backup: null as string | null,
  jobs: [] as Array<{ run: (signal: AbortSignal) => Promise<unknown> }>,
  sendChat: vi.fn(),
  cancelAiJob: vi.fn(),
  backgroundJobsEnabled: true,
  selectedModel: "local-model",
  failRestore: false,
  liveJobIds: new Set<string>(),
  schedulerListeners: new Set<() => void>(),
}));
vi.mock("@/modules/memory/memory-source-policy", () => ({
  prepareMemorySourceValidation: async () => true,
  isKnownMemorySource: () => true,
}));

vi.mock("@/stores/settings-store", () => ({ useSettingsStore: { getState: () => ({ backgroundJobsEnabled: mocks.backgroundJobsEnabled }) } }));
vi.mock("@/stores/provider-store", () => ({ useProviderStore: { getState: () => ({ selectedProvider: "lm-studio", selectedModel: mocks.selectedModel }) } }));
vi.mock("@/lib/connectivity/provider-connectivity", () => ({ isProviderAllowedForConnectivity: () => true }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args?: { memoryJson?: string }) => {
    if (command === "load_memory_snapshots") return { primary: mocks.primary, backup: mocks.backup };
    if (command === "load_or_create_conversation_key") return mocks.key;
    if (command === "save_memory_snapshot") {
      mocks.backup = mocks.primary;
      mocks.primary = args?.memoryJson ?? null;
    }
    return undefined;
  }),
}));

vi.mock("@/lib/ai-scheduler", () => ({
  aiScheduler: {
    enqueueAiJob: (job: { run: (signal: AbortSignal) => Promise<unknown> }) => {
      mocks.jobs.push(job);
      const id = `memory-job-${mocks.jobs.length - 1}`;
      mocks.liveJobIds.add(id);
      for (const listener of mocks.schedulerListeners) listener();
      return id;
    },
    cancelAiJob: mocks.cancelAiJob,
    subscribeToScheduler: (listener: () => void) => {
      mocks.schedulerListeners.add(listener);
      return () => mocks.schedulerListeners.delete(listener);
    },
    getSchedulerSnapshot: () => ({ activeJob: null, queuedJobs: [...mocks.liveJobIds].map((id) => ({ id })) }),
  },
}));

vi.mock("@/lib/providers", () => ({
  getProviderAdapter: () => ({ sendChat: mocks.sendChat }),
}));

vi.mock("@/lib/lm-model-session", () => ({
  runPostChatModelPipeline: async (options: { runTitle: () => Promise<unknown> }) => {
    await options.runTitle();
    if (mocks.failRestore) throw new Error("Model restore failed");
  },
}));

beforeEach(() => {
  mocks.primary = null;
  mocks.backup = null;
  mocks.jobs = [];
  mocks.sendChat.mockReset();
  mocks.cancelAiJob.mockReset();
  mocks.backgroundJobsEnabled = true;
  mocks.selectedModel = "local-model";
  mocks.failRestore = false;
  mocks.liveJobIds.clear();
  mocks.schedulerListeners.clear();
  mocks.cancelAiJob.mockImplementation((id: string) => {
    mocks.liveJobIds.delete(id);
    for (const listener of mocks.schedulerListeners) listener();
  });
  vi.resetModules();
});

describe("memory service", () => {
  it("allows a turn to be queued again after external queue cancellation", async () => {
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();
    await useMemoryStore.getState().setEnabled(true);
    const { queueMemoryExtraction } = await import("@/modules/memory/memory-service");
    const turn = { sourceType: "chat" as const, sourceId: "chat", turnId: "external-cancel", userText: "I prefer concise answers.", assistantText: "", model: "local-model", providerId: "lm-studio" };
    queueMemoryExtraction(turn);
    await vi.waitFor(() => expect(mocks.jobs).toHaveLength(1));
    mocks.cancelAiJob("memory-job-0");
    queueMemoryExtraction(turn);
    await vi.waitFor(() => expect(mocks.jobs).toHaveLength(2));
  });

  it("keeps committed facts if final model preparation fails and reports invalid extraction", async () => {
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();
    await useMemoryStore.getState().setEnabled(true);
    const { queueMemoryExtraction } = await import("@/modules/memory/memory-service");
    const turn = { sourceType: "chat" as const, sourceId: "chat", turnId: "restore", userText: "I prefer concise answers.", assistantText: "", model: "local-model", providerId: "lm-studio" };
    queueMemoryExtraction(turn);
    await vi.waitFor(() => expect(mocks.jobs).toHaveLength(1));
    mocks.sendChat.mockImplementation(async (options: { onChunk: (text: string, done: boolean) => void }) => {
      options.onChunk('{"facts":["I prefer concise answers."]}', false);
    });
    mocks.failRestore = true;
    await expect(mocks.jobs[0].run(new AbortController().signal)).rejects.toThrow("Model restore failed");
    expect(useMemoryStore.getState().records).toHaveLength(1);
    mocks.failRestore = false;
    mocks.sendChat.mockResolvedValue(undefined);
    queueMemoryExtraction({ ...turn, turnId: "invalid" });
    await vi.waitFor(() => expect(mocks.jobs).toHaveLength(2));
    await expect(mocks.jobs[1].run(new AbortController().signal)).rejects.toThrow("invalid facts");
  });

  it("respects the background jobs switch and skips stale local model work", async () => {
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();
    await useMemoryStore.getState().setEnabled(true);
    const { queueMemoryExtraction } = await import("@/modules/memory/memory-service");
    const turn = { sourceType: "chat" as const, sourceId: "chat", turnId: "policy", userText: "I prefer concise answers.", assistantText: "", model: "local-model", providerId: "lm-studio" };
    mocks.backgroundJobsEnabled = false;
    queueMemoryExtraction(turn);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mocks.jobs).toHaveLength(0);
    mocks.backgroundJobsEnabled = true;
    queueMemoryExtraction(turn);
    await vi.waitFor(() => expect(mocks.jobs).toHaveLength(1));
    mocks.selectedModel = "new-model";
    await mocks.jobs[0].run(new AbortController().signal);
    expect(mocks.sendChat).not.toHaveBeenCalled();
  });

  it("does not commit extracted facts when their source is deleted", async () => {
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();
    await useMemoryStore.getState().setEnabled(true);
    const { queueMemoryExtraction } = await import("@/modules/memory/memory-service");
    const { notifyMemoryDeletion } = await import("@/modules/memory/memory-lifecycle");
    queueMemoryExtraction({ sourceType: "chat", sourceId: "deleted-chat", turnId: "deleted-turn", userText: "I prefer concise answers.", assistantText: "", model: "local-model", providerId: "lm-studio" });
    await vi.waitFor(() => expect(mocks.jobs).toHaveLength(1));
    let releaseProvider!: () => void;
    mocks.sendChat.mockImplementation(async (options: { onChunk: (text: string, done: boolean) => void }) => {
      options.onChunk('{"facts":["I prefer concise answers."]}', false);
      await new Promise<void>((resolve) => { releaseProvider = resolve; });
    });
    const running = mocks.jobs[0].run(new AbortController().signal);
    await vi.waitFor(() => expect(mocks.sendChat).toHaveBeenCalledOnce());
    notifyMemoryDeletion({ sourceType: "chat", sourceId: "deleted-chat" });
    releaseProvider();
    await running;
    expect(useMemoryStore.getState().records).toEqual([]);
  });

  it("holds the background job until provider cleanup finishes after cancellation", async () => {
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();
    await useMemoryStore.getState().setEnabled(true);
    const { queueMemoryExtraction } = await import("@/modules/memory/memory-service");
    queueMemoryExtraction({
      sourceType: "chat", sourceId: "chat", turnId: "cleanup",
      userText: "I prefer concise answers.", assistantText: "",
      model: "local-model", providerId: "lm-studio",
    });
    await vi.waitFor(() => expect(mocks.jobs).toHaveLength(1));
    let releaseProvider!: () => void;
    mocks.sendChat.mockImplementation(async (options: { onComplete: () => void }) => {
      options.onComplete();
      await new Promise<void>((resolve) => { releaseProvider = resolve; });
    });
    const controller = new AbortController();
    let finished = false;
    const running = mocks.jobs[0].run(controller.signal).finally(() => { finished = true; });
    await vi.waitFor(() => expect(mocks.sendChat).toHaveBeenCalledOnce());
    controller.abort();
    await Promise.resolve();
    await Promise.resolve();
    expect(finished).toBe(false);
    releaseProvider();
    await running;
    expect(useMemoryStore.getState().records).toEqual([]);
  });

  it("retrieves personal and matching project memories with bounded lexical context", async () => {
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();
    await useMemoryStore.getState().addMemory("I prefer dark themes in my editor.");
    await useMemoryStore.getState().addMemory("Project Veyra uses TypeScript and React.", "project-a");
    await useMemoryStore.getState().addMemory("Project Atlas uses Rust.", "project-b");
    await useMemoryStore.getState().setEnabled(true);
    await vi.waitFor(() => expect(mocks.primary).not.toBeNull());

    const { retrieveMemoryContext } = await import("@/modules/memory/memory-service");
    const result = await retrieveMemoryContext({ query: "dark theme and TypeScript", projectId: "project-a" });
    expect(result.block).toContain("dark themes");
    expect(result.block).toContain("TypeScript and React");
    expect(result.block).not.toContain("Rust");
    expect(result.memoryIds).toHaveLength(2);

    const globalResult = await retrieveMemoryContext({ query: "dark TypeScript Rust", projectId: "project-b" });
    expect(globalResult.block).toContain("dark themes");
    expect(globalResult.block).toContain("Rust");
    expect(globalResult.block).not.toContain("TypeScript and React");
  });

  it("extracts only schema-validated facts from user text and ignores assistant output", async () => {
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();
    await useMemoryStore.getState().setEnabled(true);
    await vi.waitFor(() => expect(mocks.primary).not.toBeNull());

    const { queueMemoryExtraction } = await import("@/modules/memory/memory-service");
    queueMemoryExtraction({
      sourceType: "chat",
      sourceId: "conversation-1",
      turnId: "turn-1",
      userText: "I prefer concise technical explanations.",
      assistantText: "This assistant message contains an invented secret.",
      model: "local-model",
      providerId: "lm-studio",
    });
    await vi.waitFor(() => expect(mocks.jobs).toHaveLength(1));

    mocks.sendChat.mockImplementation(async (options: { messages: Array<{ content: string }>; onChunk: (chunk: string, done: boolean) => void; onComplete: () => void }) => {
      options.onChunk('{"facts":["The user prefers concise technical explanations.", "api_key=sk-12345678901234567890"]}', false);
      options.onComplete();
    });
    const job = mocks.jobs[0];
    expect(job).toBeDefined();
    if (!job) throw new Error("Expected the extraction job to be queued.");
    await job.run(new AbortController().signal);

    expect(mocks.sendChat).toHaveBeenCalledOnce();
    const submitted = JSON.stringify(mocks.sendChat.mock.calls[0]?.[0]?.messages ?? []);
    expect(submitted).toContain("I prefer concise technical explanations.");
    expect(submitted).not.toContain("invented secret");
    expect(useMemoryStore.getState().records).toEqual([
      expect.objectContaining({ text: "The user prefers concise technical explanations.", sourceId: "conversation-1", turnId: "turn-1" }),
    ]);
  });

  it("cancels queued extraction when memory is disabled", async () => {
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();
    await useMemoryStore.getState().setEnabled(true);
    await vi.waitFor(() => expect(mocks.primary).not.toBeNull());

    const { queueMemoryExtraction } = await import("@/modules/memory/memory-service");
    queueMemoryExtraction({
      sourceType: "chat",
      sourceId: "conversation-1",
      turnId: "turn-2",
      userText: "I prefer short responses in chat.",
      assistantText: "",
      model: "local-model",
      providerId: "lm-studio",
    });
    await vi.waitFor(() => expect(mocks.jobs).toHaveLength(1));
    await useMemoryStore.getState().setEnabled(false);
    expect(mocks.cancelAiJob).toHaveBeenCalledWith("memory-job-0");

    const job = mocks.jobs[0];
    expect(job).toBeDefined();
    if (!job) throw new Error("Expected the extraction job to be queued.");
    await job.run(new AbortController().signal);
    expect(mocks.sendChat).not.toHaveBeenCalled();
    expect(useMemoryStore.getState().records).toEqual([]);
  });
});

