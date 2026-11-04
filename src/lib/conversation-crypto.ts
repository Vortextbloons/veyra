// Shared AES-GCM envelope helpers for conversation snapshots.
// Used by the encrypt/decrypt workers and by the main-thread fallback in
// `conversation-storage.ts`, so the wire format only lives in one place.

const ENCRYPTION_VERSION = 2;
const LEGACY_ITERATIONS = 150_000;
const IV_BYTES = 12;

export type EncryptedSnapshot = {
  version: number;
  revision?: number;
  iv: string;
  data: string;
};

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function snapshotAdditionalData(revision: number): ArrayBuffer {
  return toArrayBuffer(new TextEncoder().encode(`veyra-conversations-v2:${revision}`));
}

export async function importConversationKey(
  keyBytes: ArrayBuffer,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, usages);
}

export async function deriveLegacyConversationKey(
  material: string,
  salt: string,
): Promise<CryptoKey> {
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
      iterations: LEGACY_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

function snapshotAlgorithm(snapshot: EncryptedSnapshot): AesGcmParams {
  const iv = toArrayBuffer(base64ToBytes(snapshot.iv));
  if (snapshot.version < 2) return { name: "AES-GCM", iv };
  return {
    name: "AES-GCM",
    iv,
    additionalData: snapshotAdditionalData(snapshot.revision ?? 0),
  };
}

/** Decrypt with the vault key, falling back to the legacy PBKDF2 key. */
export async function decryptSnapshotPayload<T>(
  snapshot: EncryptedSnapshot,
  key: CryptoKey,
  legacyKey: CryptoKey,
): Promise<T> {
  const data = toArrayBuffer(base64ToBytes(snapshot.data));
  const algorithm = snapshotAlgorithm(snapshot);

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(algorithm, key, data);
  } catch {
    decrypted = await crypto.subtle.decrypt(algorithm, legacyKey, data);
  }
  return JSON.parse(new TextDecoder().decode(decrypted)) as T;
}

export async function encryptConversationsPayload(
  conversations: unknown,
  key: CryptoKey,
  revision: number,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: snapshotAdditionalData(revision),
    },
    key,
    toArrayBuffer(new TextEncoder().encode(JSON.stringify(conversations))),
  );

  return JSON.stringify({
    version: ENCRYPTION_VERSION,
    revision,
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  } satisfies EncryptedSnapshot);
}
