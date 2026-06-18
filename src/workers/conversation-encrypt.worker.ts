/// <reference lib="webworker" />

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
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

async function importAesKey(keyBytes: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
}

self.onmessage = async (event: MessageEvent<EncryptRequest>) => {
  try {
    const { conversations, keyBytes } = event.data;
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await importAesKey(keyBytes);
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(JSON.stringify(conversations)),
    );

    self.postMessage({
      ok: true,
      snapshot: JSON.stringify({
        version: 1,
        iv: bytesToBase64(iv),
        data: bytesToBase64(new Uint8Array(encrypted)),
      }),
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "encrypt failed",
    });
  }
};

export {};
