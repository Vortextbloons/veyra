/// <reference lib="webworker" />
import {
  decryptSnapshotPayload,
  deriveLegacyConversationKey,
  importConversationKey,
  type EncryptedSnapshot,
} from "@/lib/conversation-crypto";

type Conversation = {
  id: string;
  title: string;
  messages: unknown[];
  createdAt: number;
  updatedAt: number;
};

type DecryptRequest = {
  raw: string;
  keyBytes: ArrayBuffer;
  legacyKeyMaterial: string;
  legacySalt: string;
};

self.onmessage = async (event: MessageEvent<DecryptRequest>) => {
  try {
    const { raw, keyBytes, legacyKeyMaterial, legacySalt } = event.data;
    const parsed = JSON.parse(raw) as EncryptedSnapshot | Conversation[];
    if (Array.isArray(parsed)) {
      self.postMessage({ ok: true, conversations: parsed, revision: 0 });
      return;
    }

    const conversations = await decryptSnapshotPayload<Conversation[]>(
      parsed,
      await importConversationKey(keyBytes, ["decrypt"]),
      await deriveLegacyConversationKey(legacyKeyMaterial, legacySalt),
    );
    self.postMessage({
      ok: true,
      conversations,
      revision: parsed.revision ?? 0,
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "decrypt failed",
    });
  }
};

export {};
