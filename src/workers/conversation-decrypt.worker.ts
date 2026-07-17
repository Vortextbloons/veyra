/// <reference lib="webworker" />

type EncryptedSnapshot = {
  version: number;
  revision?: number;
  iv: string;
  data: string;
};

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

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importAesKey(keyBytes: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
}

async function deriveLegacyKey(material: string, salt: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(material),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 150000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

async function decryptPayload(
  parsed: EncryptedSnapshot,
  key: CryptoKey,
  legacyKey: CryptoKey,
): Promise<Conversation[]> {
  const iv = base64ToBytes(parsed.iv);
  const data = base64ToBytes(parsed.data);
  const revision = parsed.revision ?? 0;
  const algorithm: AesGcmParams = {
    name: "AES-GCM",
    iv: toArrayBuffer(iv),
    ...(parsed.version >= 2
      ? {
          additionalData: new TextEncoder().encode(
            `veyra-conversations-v2:${revision}`,
          ),
        }
      : {}),
  };

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      algorithm,
      key,
      toArrayBuffer(data),
    );
  } catch {
    decrypted = await crypto.subtle.decrypt(
      algorithm,
      legacyKey,
      toArrayBuffer(data),
    );
  }

  return JSON.parse(new TextDecoder().decode(decrypted)) as Conversation[];
}

self.onmessage = async (event: MessageEvent<DecryptRequest>) => {
  try {
    const { raw, keyBytes, legacyKeyMaterial, legacySalt } = event.data;
    const parsed = JSON.parse(raw) as EncryptedSnapshot | Conversation[];
    if (Array.isArray(parsed)) {
      self.postMessage({ ok: true, conversations: parsed, revision: 0 });
      return;
    }

    const key = await importAesKey(keyBytes);
    const legacyKey = await deriveLegacyKey(legacyKeyMaterial, legacySalt);
    const conversations = await decryptPayload(parsed, key, legacyKey);
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
