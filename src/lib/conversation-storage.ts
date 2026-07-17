import { invoke } from "@tauri-apps/api/core";
import type { Conversation } from "@/modules/chat/chat-types";
import DecryptWorker from "@/workers/conversation-decrypt.worker?worker";
import EncryptWorker from "@/workers/conversation-encrypt.worker?worker";

const STORAGE_KEY = "veyra.conversations";
const ENCRYPTION_VERSION = 2;
const LEGACY_KEY_MATERIAL = "veyra-local-conversation-storage-v1";
const LEGACY_KEY_SALT = "veyra-conversations";
const KEY_BYTES = 32;
const SAVE_DEBOUNCE_MS = 500;

type EncryptedSnapshot = {
  version: number;
  revision?: number;
  iv: string;
  data: string;
};

type ConversationSnapshotCandidates = {
  primary: string | null;
  backup: string | null;
  primaryError?: string | null;
  backupError?: string | null;
};

type DecodedSnapshot = {
  conversations: Conversation[];
  revision: number;
};

export type ConversationStorageIssue = {
  severity: "warning" | "error";
  message: string;
};

let encryptionKeyPromise: Promise<CryptoKey> | null = null;
let decryptWorker: Worker | null = null;
let encryptWorker: Worker | null = null;
let saveQueue: Promise<void> = Promise.resolve();
let pendingSnapshot: Conversation[] | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastRevision = 0;
let storageIssue: ConversationStorageIssue | null = null;
let writesBlockedForRecovery = false;
const storageIssueListeners = new Set<() => void>();

function setStorageIssue(issue: ConversationStorageIssue | null): void {
  if (
    storageIssue?.severity === issue?.severity &&
    storageIssue?.message === issue?.message
  ) {
    return;
  }
  storageIssue = issue;
  for (const listener of storageIssueListeners) listener();
}

export function getConversationStorageIssue(): ConversationStorageIssue | null {
  return storageIssue;
}

export function subscribeConversationStorageIssue(listener: () => void): () => void {
  storageIssueListeners.add(listener);
  return () => storageIssueListeners.delete(listener);
}

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

async function loadKeyBytes(): Promise<ArrayBuffer> {
  const encoded = await invoke<string>("load_or_create_conversation_key");
  const bytes = base64ToBytes(encoded);
  if (bytes.byteLength !== KEY_BYTES) {
    throw new Error("The OS credential vault returned an invalid conversation key.");
  }
  return toArrayBuffer(bytes);
}

async function getEncryptionKey(): Promise<CryptoKey> {
  encryptionKeyPromise ??= loadKeyBytes()
    .then((bytes) =>
      crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, [
        "encrypt",
        "decrypt",
      ]),
    )
    .catch((error) => {
      encryptionKeyPromise = null;
      throw error;
    });
  return encryptionKeyPromise;
}

async function getLegacyEncryptionKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(LEGACY_KEY_MATERIAL),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(LEGACY_KEY_SALT),
      iterations: 150000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

function getDecryptWorker(): Worker {
  decryptWorker ??= new DecryptWorker();
  return decryptWorker;
}

function getEncryptWorker(): Worker {
  encryptWorker ??= new EncryptWorker();
  return encryptWorker;
}

export function terminateDecryptWorker(): void {
  decryptWorker?.terminate();
  decryptWorker = null;
}

export function terminateEncryptWorker(): void {
  encryptWorker?.terminate();
  encryptWorker = null;
}

function parseSnapshot(raw: string): EncryptedSnapshot | Conversation[] {
  const parsed: unknown = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed as Conversation[];
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as EncryptedSnapshot).version !== "number" ||
    typeof (parsed as EncryptedSnapshot).iv !== "string" ||
    typeof (parsed as EncryptedSnapshot).data !== "string"
  ) {
    throw new Error("Conversation snapshot has an invalid envelope.");
  }
  const snapshot = parsed as EncryptedSnapshot;
  if (snapshot.version >= 2) {
    if (
      typeof snapshot.revision !== "number" ||
      !Number.isSafeInteger(snapshot.revision) ||
      snapshot.revision < 0
    ) {
      throw new Error("Conversation snapshot has an invalid revision.");
    }
  }
  return snapshot;
}

function encryptionAlgorithm(snapshot: EncryptedSnapshot): AesGcmParams {
  const iv = toArrayBuffer(base64ToBytes(snapshot.iv));
  if (snapshot.version < 2) return { name: "AES-GCM", iv };
  return {
    name: "AES-GCM",
    iv,
    additionalData: new TextEncoder().encode(
      `veyra-conversations-v2:${snapshot.revision}`,
    ),
  };
}

async function decryptSnapshotOnMainThread(raw: string): Promise<DecodedSnapshot> {
  const parsed = parseSnapshot(raw);
  if (Array.isArray(parsed)) return { conversations: parsed, revision: 0 };
  const data = toArrayBuffer(base64ToBytes(parsed.data));
  const algorithm = encryptionAlgorithm(parsed);

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(algorithm, await getEncryptionKey(), data);
  } catch {
    decrypted = await crypto.subtle.decrypt(
      algorithm,
      await getLegacyEncryptionKey(),
      data,
    );
  }

  return {
    conversations: JSON.parse(new TextDecoder().decode(decrypted)) as Conversation[],
    revision: parsed.revision ?? 0,
  };
}

async function decryptSnapshot(raw: string): Promise<DecodedSnapshot> {
  try {
    const keyBytes = await loadKeyBytes();
    const worker = getDecryptWorker();
    return await new Promise<DecodedSnapshot>((resolve, reject) => {
      const handler = (
        event: MessageEvent<{
          ok: boolean;
          conversations?: Conversation[];
          revision?: number;
          error?: string;
        }>,
      ) => {
        worker.removeEventListener("message", handler);
        if (event.data.ok && event.data.conversations) {
          resolve({
            conversations: event.data.conversations,
            revision: event.data.revision ?? 0,
          });
          return;
        }
        reject(new Error(event.data.error ?? "Conversation decryption failed."));
      };
      worker.addEventListener("message", handler);
      worker.postMessage(
        {
          raw,
          keyBytes,
          legacyKeyMaterial: LEGACY_KEY_MATERIAL,
          legacySalt: LEGACY_KEY_SALT,
        },
        [keyBytes],
      );
    });
  } catch {
    return decryptSnapshotOnMainThread(raw);
  }
}

function nextRevision(): number {
  lastRevision = Math.max(Date.now(), lastRevision + 1);
  return lastRevision;
}

async function encryptSnapshotOnMainThread(
  conversations: Conversation[],
  revision: number,
): Promise<string> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encoder.encode(`veyra-conversations-v2:${revision}`),
    },
    await getEncryptionKey(),
    encoder.encode(JSON.stringify(conversations)),
  );

  return JSON.stringify({
    version: ENCRYPTION_VERSION,
    revision,
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  } satisfies EncryptedSnapshot);
}

async function encryptSnapshot(conversations: Conversation[]): Promise<string> {
  const revision = nextRevision();
  try {
    const keyBytes = await loadKeyBytes();
    const worker = getEncryptWorker();
    return await new Promise<string>((resolve, reject) => {
      const handler = (
        event: MessageEvent<{ ok: boolean; snapshot?: string; error?: string }>,
      ) => {
        worker.removeEventListener("message", handler);
        if (event.data.ok && event.data.snapshot) {
          resolve(event.data.snapshot);
          return;
        }
        reject(new Error(event.data.error ?? "Conversation encryption failed."));
      };
      worker.addEventListener("message", handler);
      worker.postMessage({ conversations, keyBytes, revision }, [keyBytes]);
    });
  } catch {
    return encryptSnapshotOnMainThread(conversations, revision);
  }
}

function readEmergencySnapshot(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

function removeEmergencySnapshot(): void {
  localStorage.removeItem(STORAGE_KEY);
}

async function writeConversationSnapshot(conversations: Conversation[]): Promise<void> {
  if (writesBlockedForRecovery) {
    setStorageIssue({
      severity: "error",
      message:
        "Conversation saving is paused to avoid overwriting data that could not be recovered. Keep the existing files and resolve the credential or corruption problem first.",
    });
    return;
  }
  try {
    const encrypted = await encryptSnapshot(conversations);
    try {
      await invoke("save_conversations", { conversationsJson: encrypted });
      try {
        removeEmergencySnapshot();
      } catch {
        // A stale emergency copy is harmless because revisions are compared on load.
      }
      setStorageIssue(null);
    } catch (primaryError) {
      try {
        localStorage.setItem(STORAGE_KEY, encrypted);
        setStorageIssue({
          severity: "warning",
          message:
            "Veyra could not write the primary conversation file. Your latest chats were saved to emergency browser storage; keep the app open until primary storage is available.",
        });
      } catch (fallbackError) {
        setStorageIssue({
          severity: "error",
          message: `Veyra could not save conversations to primary or emergency storage: ${
            fallbackError instanceof Error
              ? fallbackError.message
              : String(primaryError)
          }`,
        });
      }
    }
  } catch (error) {
    setStorageIssue({
      severity: "error",
      message: `Veyra could not encrypt conversations for saving: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
}

function queuePendingSave(): void {
  saveQueue = saveQueue
    .catch(() => undefined)
    .then(async () => {
      let snapshot = pendingSnapshot;
      pendingSnapshot = null;
      if (!snapshot) return;
      await writeConversationSnapshot(snapshot);
      while (pendingSnapshot) {
        snapshot = pendingSnapshot;
        pendingSnapshot = null;
        await writeConversationSnapshot(snapshot);
      }
    });
}

export function saveConversationSnapshot(conversations: Conversation[]): Promise<void> {
  pendingSnapshot = conversations;
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    queuePendingSave();
  }, SAVE_DEBOUNCE_MS);
  return saveQueue;
}

export function flushConversationSave(): Promise<void> {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    queuePendingSave();
  }
  return saveQueue.catch(() => undefined);
}

export async function loadConversationSnapshot(): Promise<Conversation[]> {
  let candidates: ConversationSnapshotCandidates = {
    primary: null,
    backup: null,
    primaryError: null,
    backupError: null,
  };
  let primaryReadError: unknown = null;

  try {
    candidates = await invoke<ConversationSnapshotCandidates>(
      "load_conversation_snapshots",
    );
  } catch (error) {
    primaryReadError = error;
  }

  let emergency: string | null = null;
  try {
    emergency = readEmergencySnapshot();
  } catch {
    // The primary and backup candidates can still be used.
  }

  const sources = [
    { name: "primary", raw: candidates.primary, priority: 3 },
    { name: "backup", raw: candidates.backup, priority: 2 },
    { name: "emergency", raw: emergency, priority: 1 },
  ].filter((source): source is { name: string; raw: string; priority: number } =>
    Boolean(source.raw),
  );

  if (sources.length === 0) {
    const candidateReadError =
      candidates.primaryError ?? candidates.backupError ?? primaryReadError;
    if (candidateReadError) {
      writesBlockedForRecovery = true;
      const message = `Veyra could not read conversation storage: ${
        candidateReadError instanceof Error
          ? candidateReadError.message
          : String(candidateReadError)
      }`;
      setStorageIssue({ severity: "error", message });
      throw new Error(message);
    }
    writesBlockedForRecovery = false;
    setStorageIssue(null);
    return [];
  }

  const valid: Array<{
    name: string;
    priority: number;
    decoded: DecodedSnapshot;
  }> = [];
  const invalidSources: string[] = [
    ...(candidates.primaryError ? ["primary"] : []),
    ...(candidates.backupError ? ["backup"] : []),
  ];
  for (const source of sources) {
    try {
      valid.push({
        name: source.name,
        priority: source.priority,
        decoded: await decryptSnapshot(source.raw),
      });
    } catch {
      invalidSources.push(source.name);
    }
  }

  if (valid.length === 0) {
    writesBlockedForRecovery = true;
    const message =
      "Veyra found conversation data but could not decrypt or validate any copy. The files were left untouched for recovery.";
    setStorageIssue({ severity: "error", message });
    throw new Error(message);
  }

  valid.sort(
    (left, right) =>
      right.decoded.revision - left.decoded.revision ||
      right.priority - left.priority,
  );
  const selected = valid[0];
  writesBlockedForRecovery = false;
  lastRevision = Math.max(lastRevision, selected.decoded.revision);

  if (selected.name !== "primary") {
    setStorageIssue({
      severity: "warning",
      message: `Veyra recovered conversations from ${selected.name} storage because it was the newest valid copy. The next successful save will repair primary storage.`,
    });
  } else if (invalidSources.length > 0) {
    setStorageIssue({
      severity: "warning",
      message: `Conversations loaded from primary storage, but the ${invalidSources.join(
        " and ",
      )} copy could not be validated. The next save will replace it.`,
    });
  } else {
    setStorageIssue(null);
  }

  return selected.decoded.conversations;
}
