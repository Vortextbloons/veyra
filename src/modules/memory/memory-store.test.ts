import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  key: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
  primary: null as string | null,
  backup: null as string | null,
  writes: 0,
  writeFailures: 0,
  readFailures: 0,
}));

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptedSnapshot(value: unknown, revision: number): Promise<string> {
  const rawKey = Uint8Array.from(atob(mocks.key), (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = new Uint8Array(12).fill(revision & 0xff);
  const additionalData = new TextEncoder().encode(`veyra-memory-v1:${revision}`);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return JSON.stringify({
    version: 1,
    revision,
    iv: base64(iv),
    data: base64(new Uint8Array(ciphertext)),
  });
}

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args?: { memoryJson?: string; preserveBackup?: boolean; mirrorBoth?: boolean }) => {
    if (command === "load_memory_snapshots") {
      if (mocks.readFailures > 0) {
        mocks.readFailures -= 1;
        throw new Error("temporary read failure");
      }
      return { primary: mocks.primary, backup: mocks.backup };
    }
    if (command === "load_or_create_conversation_key") return mocks.key;
    if (command === "save_memory_snapshot") {
      if (mocks.writeFailures > 0) {
        mocks.writeFailures -= 1;
        throw new Error("temporary write failure");
      }
      if (args?.mirrorBoth) mocks.backup = args.memoryJson ?? null;
      else if (!args?.preserveBackup) mocks.backup = mocks.primary;
      mocks.primary = args?.memoryJson ?? null;
      mocks.writes += 1;
    }
    return undefined;
  }),
}));

beforeEach(() => {
  mocks.primary = null;
  mocks.backup = null;
  mocks.writes = 0;
  mocks.writeFailures = 0;
  mocks.readFailures = 0;
  vi.resetModules();
});

describe("encrypted memory store", () => {
  it("does not briefly enable memory during hydration after an explicit disable", async () => {
    mocks.primary = await encryptedSnapshot({ enabled: true, records: [], processedTurns: [] }, 10);
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    const observed: boolean[] = [];
    const unsubscribe = useMemoryStore.subscribe((state) => observed.push(state.enabled));
    await useMemoryStore.getState().setEnabled(false);
    unsubscribe();
    expect(observed).not.toContain(true);
    expect(useMemoryStore.getState().enabled).toBe(false);
  });

  it("rechecks extraction validity inside the serialized commit after async handoff", async () => {
    const { useMemoryStore, commitExtractedMemories } = await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();
    await useMemoryStore.getState().setEnabled(true);
    let allowed = true;
    const queued = commitExtractedMemories({
      sourceType: "chat", sourceId: "stale-source", turnId: "stale-turn",
      userText: "I prefer concise answers.", assistantText: "",
      providerId: "lm-studio", model: "local-model",
    }, ["I prefer concise answers."], () => allowed);
    // A disable, edit, or deletion can invalidate extraction while its commit
    // is waiting for initialization or another encrypted mutation.
    allowed = false;
    await expect(queued).resolves.toBe(false);
    expect(useMemoryStore.getState().records).toEqual([]);
  });

  it("defaults to off and stores enabled state and records only in encrypted snapshots", async () => {
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();

    expect(useMemoryStore.getState().enabled).toBe(false);
    await useMemoryStore.getState().addMemory("I prefer concise answers.");
    await useMemoryStore.getState().setEnabled(true);
    expect(mocks.writes).toBeGreaterThanOrEqual(2);

    expect(mocks.primary).not.toContain("I prefer concise answers.");
    expect(mocks.primary).not.toContain(mocks.key);
    expect(JSON.parse(mocks.primary ?? "{}")).toMatchObject({ version: 1 });

    vi.resetModules();
    const reloaded = await import("@/modules/memory/memory-store");
    await reloaded.useMemoryStore.getState().initialize();
    expect(reloaded.useMemoryStore.getState()).toMatchObject({
      enabled: true,
      records: [expect.objectContaining({ text: "I prefer concise answers." })],
      error: null,
    });
  });

  it("supports scoped manual CRUD and rejects credential or log-shaped memory", async () => {
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();
    await useMemoryStore.getState().addMemory("The project uses TypeScript.", "project-a");
    const created = useMemoryStore.getState().records[0];
    expect(created).toMatchObject({ projectId: "project-a", sourceType: "chat", sourceId: "manual" });

    await useMemoryStore.getState().updateMemory(created.id, "The project uses React and TypeScript.");
    expect(useMemoryStore.getState().records[0]?.text).toBe("The project uses React and TypeScript.");
    await expect(useMemoryStore.getState().addMemory("api_key=sk-12345678901234567890")).rejects.toThrow("credentials");
    await expect(useMemoryStore.getState().addMemory("My PIN is 4829.")).rejects.toThrow("credentials");
    await expect(useMemoryStore.getState().addMemory("The deploy token abcdefghijklmnop is active.")).rejects.toThrow("credentials");
    await expect(useMemoryStore.getState().addMemory("Connect with postgres://alice:secret@db.local/app")).rejects.toThrow("credentials");
    await expect(useMemoryStore.getState().addMemory("I have a 2048 token budget for prompts.", "project-a")).resolves.toBeUndefined();
    await expect(useMemoryStore.getState().addMemory("ERROR: request failed at 2026-10-26T12:00:00Z")).rejects.toThrow("raw logs");

    await useMemoryStore.getState().clearMemories("project-a");
    expect(useMemoryStore.getState().records).toEqual([]);
  });

  it("uses the encrypted turn ledger to deduplicate turns even when no facts were extracted", async () => {
    const { useMemoryStore, commitExtractedMemories, hasProcessedMemoryTurn } = await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();
    await useMemoryStore.getState().setEnabled(true);

    const turn = {
      sourceType: "chat" as const,
      sourceId: "conversation-1",
      turnId: "message-pair-1",
      userText: "I prefer short answers.",
      assistantText: "",
      model: "local-model",
      providerId: "lm-studio",
    };
    await expect(hasProcessedMemoryTurn(turn)).resolves.toBe(false);
    await expect(commitExtractedMemories(turn, [])).resolves.toBe(true);
    await expect(hasProcessedMemoryTurn(turn)).resolves.toBe(true);
    await expect(commitExtractedMemories(turn, ["I prefer short answers."])).resolves.toBe(false);
    expect(useMemoryStore.getState().records).toEqual([]);
  });

  it("mirrors deletes and disabling so corrupt primaries cannot restore old facts or enabled state", async () => {
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();
    await useMemoryStore.getState().addMemory("I prefer concise answers.");
    const record = useMemoryStore.getState().records[0];
    await useMemoryStore.getState().setEnabled(true);
    await useMemoryStore.getState().deleteMemory(record.id);
    expect(mocks.backup).toBe(mocks.primary);

    mocks.primary = "corrupt primary";
    vi.resetModules();
    const recoveredAfterDelete = await import("@/modules/memory/memory-store");
    await recoveredAfterDelete.useMemoryStore.getState().initialize();
    expect(recoveredAfterDelete.useMemoryStore.getState().records).toEqual([]);

    await recoveredAfterDelete.useMemoryStore.getState().addMemory("I prefer concise answers.");
    await recoveredAfterDelete.useMemoryStore.getState().setEnabled(true);
    await recoveredAfterDelete.useMemoryStore.getState().setEnabled(false);
    expect(mocks.backup).toBe(mocks.primary);
    mocks.primary = "corrupt primary";
    vi.resetModules();
    const recoveredAfterDisable = await import("@/modules/memory/memory-store");
    await recoveredAfterDisable.useMemoryStore.getState().initialize();
    expect(recoveredAfterDisable.useMemoryStore.getState()).toMatchObject({ enabled: false, records: [expect.any(Object)] });
  });

  it("keeps disabling in effect when persistence fails and supports retry", async () => {
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();
    await useMemoryStore.getState().addMemory("I prefer concise answers.");
    await useMemoryStore.getState().setEnabled(true);

    mocks.writeFailures = 1;
    await expect(useMemoryStore.getState().setEnabled(false)).rejects.toThrow("could not save");
    expect(useMemoryStore.getState().enabled).toBe(false);
    expect(useMemoryStore.getState().error).toMatch(/retry/i);

    await useMemoryStore.getState().retrySave();
    expect(useMemoryStore.getState()).toMatchObject({ enabled: false, error: null });
    expect(mocks.backup).toBe(mocks.primary);
  });

  it("restores visible CRUD state after failed saves and serializes concurrent mutations", async () => {
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();
    await useMemoryStore.getState().addMemory("I prefer concise answers.");
    const record = useMemoryStore.getState().records[0];

    mocks.writeFailures = 1;
    await expect(useMemoryStore.getState().updateMemory(record.id, "I prefer detailed answers.")).rejects.toThrow("could not save");
    expect(useMemoryStore.getState().records[0]?.text).toBe("I prefer concise answers.");

    await useMemoryStore.getState().retrySave();
    mocks.writeFailures = 1;
    await expect(useMemoryStore.getState().deleteMemory(record.id)).rejects.toThrow("could not save");
    expect(useMemoryStore.getState().records[0]?.id).toBe(record.id);
    await useMemoryStore.getState().retrySave();
    await Promise.all([
      useMemoryStore.getState().addMemory("I work on desktop software."),
      useMemoryStore.getState().addMemory("I use Windows for development."),
    ]);
    expect(useMemoryStore.getState().records.map(({ text }) => text)).toEqual([
      "I prefer concise answers.",
      "I work on desktop software.",
      "I use Windows for development.",
    ]);
  });

  it("retries initialization after a transient read failure", async () => {
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    mocks.readFailures = 1;
    await expect(useMemoryStore.getState().initialize()).rejects.toThrow("could not read or save");
    await expect(useMemoryStore.getState().initialize()).resolves.toBeUndefined();
    expect(useMemoryStore.getState()).toMatchObject({ loading: false, error: null, enabled: false });
  });

  it("clears source records and the turn ledger in both snapshots", async () => {
    const { useMemoryStore, commitExtractedMemories, hasProcessedMemoryTurn, removeMemoriesBySource } =
      await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();
    await useMemoryStore.getState().setEnabled(true);
    const turn = {
      sourceType: "chat" as const,
      sourceId: "conversation-delete-me",
      turnId: "turn-1",
      userText: "I prefer concise answers.",
      assistantText: "",
      model: "local-model",
      providerId: "lm-studio",
    };
    await commitExtractedMemories(turn, ["I prefer concise answers."]);
    expect(await hasProcessedMemoryTurn(turn)).toBe(true);
    await removeMemoriesBySource("chat", turn.sourceId);
    expect(useMemoryStore.getState().records).toEqual([]);
    expect(await hasProcessedMemoryTurn(turn)).toBe(false);
    expect(mocks.backup).toBe(mocks.primary);
  });

  it("clears the encrypted turn ledger when all memories are cleared", async () => {
    const { useMemoryStore, commitExtractedMemories, hasProcessedMemoryTurn } = await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();
    await useMemoryStore.getState().setEnabled(true);
    const turn = {
      sourceType: "agent" as const,
      sourceId: "agent-1",
      turnId: "turn-1",
      userText: "I prefer concise answers.",
      assistantText: "",
      model: "local-model",
      providerId: "lm-studio",
    };
    await commitExtractedMemories(turn, []);
    expect(await hasProcessedMemoryTurn(turn)).toBe(true);
    await useMemoryStore.getState().clearMemories();
    expect(await hasProcessedMemoryTurn(turn)).toBe(false);
    expect(mocks.backup).toBe(mocks.primary);
  });

  it("salvages valid records from an authenticated snapshot and reports skipped invalid records", async () => {
    const validRecord = {
      id: "valid-record",
      text: "I prefer concise answers.",
      sourceType: "chat",
      sourceId: "conversation-1",
      turnId: "turn-1",
      createdAt: 1,
      updatedAt: 1,
    };
    mocks.primary = await encryptedSnapshot({
      enabled: true,
      records: [validRecord, { ...validRecord, id: "invalid-record", text: "My password is secret123." }],
      processedTurns: [],
    }, 25);
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    await useMemoryStore.getState().initialize();

    expect(useMemoryStore.getState().records).toEqual([expect.objectContaining({ id: "valid-record" })]);
    expect(useMemoryStore.getState().error).toMatch(/1 invalid memory record was skipped/i);
  });

  it("fails closed and preserves snapshots from an incompatible envelope version", async () => {
    mocks.primary = JSON.stringify({ version: 2, revision: 50, iv: "future", data: "future" });
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    await expect(useMemoryStore.getState().initialize()).rejects.toThrow(/version/i);
    await expect(useMemoryStore.getState().retrySave()).rejects.toThrow(/version/i);
    expect(useMemoryStore.getState().error).toMatch(/left untouched/i);
    expect(mocks.primary).toContain('"version":2');
    expect(mocks.writes).toBe(0);
  });

  it("fails closed on an unauthenticated encrypted envelope without mislabeling it as a version issue", async () => {
    mocks.primary = JSON.stringify({ version: 1, revision: 50, iv: "AAAAAAAAAAAAAAAA", data: "AAAA" });
    const { useMemoryStore } = await import("@/modules/memory/memory-store");
    await expect(useMemoryStore.getState().initialize()).rejects.toThrow(/could not read or save/i);
    expect(useMemoryStore.getState().error).toMatch(/could not read or save/i);
    expect(useMemoryStore.getState().error).not.toMatch(/version/i);
    await expect(useMemoryStore.getState().retrySave()).rejects.toThrow(/could not read or save/i);
    expect(mocks.writes).toBe(0);
  });
});
