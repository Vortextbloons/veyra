import { invoke } from "@tauri-apps/api/core";
import type { Conversation } from "@/lib/chat-types";
import DecryptWorker from "@/workers/conversation-decrypt.worker?worker";

const STORAGE_KEY = "veyra.conversations";
const ENCRYPTION_VERSION = 1;
const KEY_MATERIAL = "veyra-local-conversation-storage-v1";
const KEY_SALT = "veyra-conversations";
const KEY_BYTES = 32;

let encryptionKeyPromise: Promise<CryptoKey> | null = null;
let decryptWorker: Worker | null = null;
let saveQueue: Promise<void> = Promise.resolve();

type EncryptedSnapshot = {
  version: number;
  iv: string;
  data: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function getEncryptionKey(): Promise<CryptoKey> {
  encryptionKeyPromise ??= getStoredEncryptionKey().catch(getLegacyEncryptionKey);
  return encryptionKeyPromise;
}

async function getStoredEncryptionKey(): Promise<CryptoKey> {
  let key = await invoke<string>("load_or_create_conversation_key");
  if (!key) {
    key = bytesToBase64(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
    await invoke("save_conversation_key", { key });
  }

  const bytes = base64ToBytes(key);
  if (bytes.byteLength !== KEY_BYTES) throw new Error("Invalid conversation key");
  return crypto.subtle.importKey("raw", toArrayBuffer(bytes), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function getLegacyEncryptionKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(KEY_MATERIAL),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(KEY_SALT),
      iterations: 150000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function getKeyBytesForWorker(): Promise<ArrayBuffer> {
  let key = await invoke<string>("load_or_create_conversation_key");
  if (!key) {
    key = bytesToBase64(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
    await invoke("save_conversation_key", { key });
  }
  const bytes = base64ToBytes(key);
  if (bytes.byteLength !== KEY_BYTES) throw new Error("Invalid conversation key");
  return toArrayBuffer(bytes);
}

function getDecryptWorker(): Worker {
  decryptWorker ??= new DecryptWorker();
  return decryptWorker;
}

async function decryptSnapshot(raw: string): Promise<Conversation[]> {
  try {
    const keyBytes = await getKeyBytesForWorker();
    const worker = getDecryptWorker();
    return await new Promise<Conversation[]>((resolve, reject) => {
      const handler = (event: MessageEvent<{ ok: boolean; conversations?: Conversation[]; error?: string }>) => {
        worker.removeEventListener("message", handler);
        if (event.data.ok && event.data.conversations) {
          resolve(event.data.conversations);
          return;
        }
        reject(new Error(event.data.error ?? "decrypt failed"));
      };
      worker.addEventListener("message", handler);
      worker.postMessage(
        {
          raw,
          keyBytes,
          legacyKeyMaterial: KEY_MATERIAL,
          legacySalt: KEY_SALT,
        },
        [keyBytes],
      );
    });
  } catch {
    return decryptSnapshotOnMainThread(raw);
  }
}

async function decryptSnapshotOnMainThread(raw: string): Promise<Conversation[]> {
  const parsed = JSON.parse(raw) as EncryptedSnapshot | Conversation[];
  if (Array.isArray(parsed)) return parsed;
  const iv = base64ToBytes(parsed.iv);
  const data = base64ToBytes(parsed.data);

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      await getEncryptionKey(),
      toArrayBuffer(data),
    );
  } catch {
    decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      await getLegacyEncryptionKey(),
      toArrayBuffer(data),
    );
  }

  return JSON.parse(new TextDecoder().decode(decrypted)) as Conversation[];
}

async function encryptSnapshot(conversations: Conversation[]): Promise<string> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await getEncryptionKey(),
    encoder.encode(JSON.stringify(conversations)),
  );

  return JSON.stringify({
    version: ENCRYPTION_VERSION,
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  } satisfies EncryptedSnapshot);
}

async function saveFallback(conversations: Conversation[]) {
  try {
    if (conversations.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, await encryptSnapshot(conversations));
  } catch {
    // storage full or unavailable
  }
}

async function loadFallback(): Promise<Conversation[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return decryptSnapshot(raw);
  } catch {
    return [];
  }
}

async function writeConversationSnapshot(conversations: Conversation[]) {
  try {
    await invoke("save_conversations", {
      conversationsJson: await encryptSnapshot(conversations),
    });
  } catch {
    await saveFallback(conversations);
  }
}

export function saveConversationSnapshot(conversations: Conversation[]) {
  const snapshot = conversations.map((conversation) => ({
    ...conversation,
    messages: conversation.messages.map((message) => ({ ...message })),
  }));
  saveQueue = saveQueue.catch(() => undefined).then(() => writeConversationSnapshot(snapshot));
  return saveQueue;
}

export async function loadConversationSnapshot(): Promise<Conversation[]> {
  try {
    const raw = await invoke<string>("load_conversations");
    if (!raw) return loadFallback();
    return decryptSnapshot(raw);
  } catch {
    return loadFallback();
  }
}
