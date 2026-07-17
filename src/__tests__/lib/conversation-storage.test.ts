import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  primary: null as string | null,
  backup: null as string | null,
  saveFails: false,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) => {
    if (command === "load_conversation_snapshots") {
      return { primary: mocks.primary, backup: mocks.backup };
    }
    if (command === "load_or_create_conversation_key") return mocks.key;
    if (command === "save_conversations" && mocks.saveFails) {
      throw new Error("disk unavailable");
    }
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

async function encryptedSnapshot(revision: number): Promise<string> {
  const keyBytes = Uint8Array.from(atob(mocks.key), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const conversations = [
    {
      id: "conversation-1",
      title: "Recovered",
      messages: [],
      createdAt: 1,
      updatedAt: 2,
    },
  ];
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(
        `veyra-conversations-v2:${revision}`,
      ),
    },
    key,
    new TextEncoder().encode(JSON.stringify(conversations)),
  );
  const toBase64 = (bytes: Uint8Array) => {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  };
  return JSON.stringify({
    version: 2,
    revision,
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(encrypted)),
  });
}

async function legacyEncryptedSnapshot(): Promise<string> {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode("veyra-local-conversation-storage-v1"),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("veyra-conversations"),
      iterations: 150000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(
      JSON.stringify([
        {
          id: "legacy-conversation",
          title: "Legacy",
          messages: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
    ),
  );
  const toBase64 = (bytes: Uint8Array) => {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  };
  return JSON.stringify({
    version: 1,
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(encrypted)),
  });
}

describe("conversation-storage recovery", () => {
  beforeEach(() => {
    mocks.primary = null;
    mocks.backup = null;
    mocks.saveFails = false;
    vi.resetModules();
  });

  it("reports corrupt persisted data instead of silently returning an empty list", async () => {
    mocks.primary = "{not-json";
    const storage = await import("@/lib/conversation-storage");

    await expect(storage.loadConversationSnapshot()).rejects.toThrow(
      "could not decrypt or validate any copy",
    );
    expect(storage.getConversationStorageIssue()).toMatchObject({
      severity: "error",
    });
  });

  it("recovers the newest valid backup when the primary is corrupt", async () => {
    mocks.primary = "{not-json";
    mocks.backup = await encryptedSnapshot(42);
    const storage = await import("@/lib/conversation-storage");

    await expect(storage.loadConversationSnapshot()).resolves.toEqual([
      expect.objectContaining({ id: "conversation-1", title: "Recovered" }),
    ]);
    expect(storage.getConversationStorageIssue()).toMatchObject({
      severity: "warning",
      message: expect.stringContaining("backup"),
    });
  });

  it("keeps decrypt-only compatibility with deterministic legacy snapshots", async () => {
    mocks.primary = await legacyEncryptedSnapshot();
    const storage = await import("@/lib/conversation-storage");

    await expect(storage.loadConversationSnapshot()).resolves.toEqual([
      expect.objectContaining({ id: "legacy-conversation", title: "Legacy" }),
    ]);
  });

  it("surfaces a save failure when neither primary nor emergency storage works", async () => {
    mocks.saveFails = true;
    const storage = await import("@/lib/conversation-storage");

    void storage.saveConversationSnapshot([]);
    await storage.flushConversationSave();

    expect(storage.getConversationStorageIssue()).toMatchObject({
      severity: "error",
      message: expect.stringContaining("could not save"),
    });
  });
});
