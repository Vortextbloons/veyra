import { describe, expect, it, vi } from "vitest";
import { base64ToBytes, bytesToBase64, decryptSnapshotPayload, encryptConversationsPayload, importConversationKey, type EncryptedSnapshot } from "@/lib/conversation-crypto";

describe("startup snapshot decryption", () => {
  it("decodes every byte value without changing the base64 format", () => {
    const bytes = Uint8Array.from({ length: 65536 }, (_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
  it("does not derive a legacy key when the vault key decrypts successfully", async () => {
    const key = await importConversationKey(new Uint8Array(32).buffer, ["encrypt", "decrypt"]);
    const snapshot = JSON.parse(await encryptConversationsPayload([{ id: "test" }], key, 123)) as EncryptedSnapshot;
    const legacy = vi.fn(() => Promise.reject(new Error("must not derive")));
    expect(await decryptSnapshotPayload(snapshot, key, legacy)).toEqual([{ id: "test" }]);
    expect(legacy).not.toHaveBeenCalled();
  });
  it("still recovers legacy envelopes when the vault key fails", async () => {
    const vault = await importConversationKey(new Uint8Array(32).buffer, ["decrypt"]);
    const legacy = await importConversationKey(new Uint8Array(32).fill(1).buffer, ["encrypt", "decrypt"]);
    const iv = new Uint8Array(12);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, legacy, new TextEncoder().encode(JSON.stringify([{ id: "legacy" }])));
    const snapshot = { version: 1, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) };
    const derive = vi.fn(async () => legacy);
    expect(await decryptSnapshotPayload(snapshot, vault, derive)).toEqual([{ id: "legacy" }]);
    expect(derive).toHaveBeenCalledOnce();
  });
  it("continues rejecting altered authenticated snapshot revisions", async () => {
    const key = await importConversationKey(new Uint8Array(32).buffer, ["encrypt", "decrypt"]);
    const snapshot = JSON.parse(await encryptConversationsPayload([], key, 1)) as EncryptedSnapshot;
    snapshot.revision = 2;
    await expect(decryptSnapshotPayload(snapshot, key, async () => key)).rejects.toThrow();
  });
});
