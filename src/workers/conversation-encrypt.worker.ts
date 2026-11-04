/// <reference lib="webworker" />
import {
  encryptConversationsPayload,
  importConversationKey,
} from "@/lib/conversation-crypto";

type Conversation = {
  id: string;
  title: string;
  messages: unknown[];
  createdAt: number;
  updatedAt: number;
};

type EncryptRequest = {
  conversations: Conversation[];
  keyBytes: ArrayBuffer;
  revision: number;
};

self.onmessage = async (event: MessageEvent<EncryptRequest>) => {
  try {
    const { conversations, keyBytes, revision } = event.data;
    const key = await importConversationKey(keyBytes, ["encrypt"]);
    self.postMessage({
      ok: true,
      snapshot: await encryptConversationsPayload(conversations, key, revision),
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "encrypt failed",
    });
  }
};

export {};
