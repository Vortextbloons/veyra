import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { MemoryRecord, MemoryTurnInput } from "@/modules/memory/memory-types";
import { invalidatePendingMemoryExtraction, isMemorySourceDeleted } from "./memory-lifecycle";

const ENVELOPE_VERSION = 1;
const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;
const MAX_MEMORY_RECORDS = 500;
const MAX_PROCESSED_TURNS = 1_000;
const MAX_MEMORY_TEXT_LENGTH = 500;
const MAX_PROJECT_ID_LENGTH = 200;
const MAX_SOURCE_ID_LENGTH = 200;
const MAX_TURN_ID_LENGTH = 200;

type EncryptedSnapshot = {
  version: number;
  revision: number;
  iv: string;
  data: string;
};

type SnapshotCandidates = {
  primary: string | null;
  backup: string | null;
  primaryError?: string | null;
  backupError?: string | null;
};

type PersistedMemory = {
  enabled: boolean;
  records: MemoryRecord[];
  processedTurns: string[];
};

type MemoryStoreState = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  records: MemoryRecord[];
  loading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  addMemory: (text: string, projectId?: string) => Promise<void>;
  updateMemory: (id: string, text: string) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  clearMemories: (projectId?: string) => Promise<void>;
  retrySave: () => Promise<void>;
};

let keyPromise: Promise<CryptoKey> | null = null;
let initializationPromise: Promise<void> | null = null;
let initialized = false;
let writesBlockedForRecovery = false;
let recoveryBlockError: string | null = null;
let needsRepairFromBackup = false;
let needsMirroredRetry = false;
let skippedRecordWarning: string | null = null;
let lastRevision = 0;
let mutationQueue: Promise<void> = Promise.resolve();
let processedTurns: string[] = [];
let enabledRequestVersion = 0;
let pendingEnabledRequest: boolean | null = null;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function getEncryptionKey(): Promise<CryptoKey> {
  keyPromise ??= invoke<string>("load_or_create_conversation_key")
    .then((encoded) => {
      const bytes = fromBase64(encoded);
      if (bytes.byteLength !== 32) throw new Error("invalid key");
      return crypto.subtle.importKey("raw", toArrayBuffer(bytes), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    })
    .catch((error: unknown) => {
      keyPromise = null;
      throw error;
    });
  return keyPromise;
}

function nextRevision(): number {
  lastRevision = Math.max(Date.now(), lastRevision + 1);
  return lastRevision;
}

function snapshotAad(revision: number): ArrayBuffer {
  return toArrayBuffer(new TextEncoder().encode(`veyra-memory-v1:${revision}`));
}

async function encryptSnapshot(value: PersistedMemory): Promise<string> {
  const revision = nextRevision();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cleartext = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: snapshotAad(revision) },
    await getEncryptionKey(),
    cleartext,
  );
  return JSON.stringify({
    version: ENVELOPE_VERSION,
    revision,
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(encrypted)),
  } satisfies EncryptedSnapshot);
}

class UnsupportedMemoryEnvelopeVersionError extends Error {}

function parseEnvelope(raw: string): EncryptedSnapshot {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("invalid envelope");
  const envelope = parsed as Partial<EncryptedSnapshot>;
  if ("version" in envelope && envelope.version !== ENVELOPE_VERSION) {
    throw new UnsupportedMemoryEnvelopeVersionError("unsupported envelope version");
  }
  if (
    typeof envelope.revision !== "number" ||
    !Number.isSafeInteger(envelope.revision) ||
    typeof envelope.iv !== "string" ||
    typeof envelope.data !== "string"
  ) {
    throw new Error("invalid envelope");
  }
  if (envelope.revision < 0) throw new Error("invalid revision");
  return envelope as EncryptedSnapshot;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidProjectId(projectId: unknown): projectId is string | undefined {
  return projectId === undefined ||
    (typeof projectId === "string" && projectId.trim().length > 0 && projectId.length <= MAX_PROJECT_ID_LENGTH);
}

const SECRET_PATTERNS = [
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|password|passwd|passphrase|private[_ -]?key|secret|pin|passcode)\s*(?::|=|\bis\b)\s*\S/i,
  /\b(?:deploy(?:ment)?[_ -]?token)\s*(?::|=|\bis\b|\s)\s*[A-Za-z0-9._~+/-]{6,}/i,
  /\b(?:sk-[A-Za-z0-9]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|npm_[A-Za-z0-9]{20,}|pypi-[A-Za-z0-9_-]{20,})\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~-]{16,}/i,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?|ssh|sftp|ftp):\/\/[^\s/@:]+:[^\s/@]+@/i,
];

const LOG_OR_CODE_PATTERNS = [
  /```/,
  /^\s*(?:const|let|var|function|class|import|export|return)\s+[A-Za-z_$]/m,
  /^\s*(?:at\s+\S+|Traceback \(most recent call last\)|\[(?:INFO|WARN|ERROR|DEBUG|TRACE)\])/im,
  /^\s*\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:/m,
  /^\s*(?:INFO|WARN|ERROR|DEBUG|TRACE)\s*[:|]/im,
  /\b(?:GET|POST|PUT|DELETE|PATCH)\s+\/\S+\s+\d{3}\b/i,
];

function looksLikeSecret(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

function looksLikeRawLogOrCode(value: string): boolean {
  if (value.split(/\r?\n/).length > 3) return true;
  return LOG_OR_CODE_PATTERNS.some((pattern) => pattern.test(value));
}

export function isSafeMemoryExtractionInput(value: string): boolean {
  const text = value.trim();
  return text.length >= 8 && text.length <= 8_000 &&
    !looksLikeSecret(text) && !looksLikeRawLogOrCode(text);
}

export function validateMemoryText(value: string): string {
  const original = value.trim();
  if (looksLikeRawLogOrCode(original)) throw new Error("Memory must be a short fact, not raw logs or code.");
  const text = original.replace(/\s+/g, " ");
  if (!text || text.length > MAX_MEMORY_TEXT_LENGTH) {
    throw new Error(`Memory text must be between 1 and ${MAX_MEMORY_TEXT_LENGTH} characters.`);
  }
  if ([...text].some((character) => {
    const code = character.charCodeAt(0);
    return code < 9 || (code >= 11 && code <= 12) || (code >= 14 && code <= 31);
  })) {
    throw new Error("Memory text contains unsupported control characters.");
  }
  if (looksLikeSecret(text)) throw new Error("Memory cannot contain credentials or secrets.");
  if (looksLikeRawLogOrCode(text)) throw new Error("Memory must be a short fact, not raw logs or code.");
  return text;
}

function parseMemoryRecord(value: unknown): MemoryRecord | null {
  if (!isPlainObject(value)) return null;
  const record = value;
  if (
    typeof record.id !== "string" || !record.id.trim() || record.id.length > 200 ||
    typeof record.text !== "string" ||
    (record.sourceType !== "chat" && record.sourceType !== "agent") ||
    typeof record.sourceId !== "string" || !record.sourceId.trim() || record.sourceId.length > MAX_SOURCE_ID_LENGTH ||
    typeof record.turnId !== "string" || !record.turnId.trim() || record.turnId.length > MAX_TURN_ID_LENGTH ||
    typeof record.createdAt !== "number" || !Number.isFinite(record.createdAt) ||
    typeof record.updatedAt !== "number" || !Number.isFinite(record.updatedAt) ||
    !isValidProjectId(record.projectId)
  ) return null;
  try {
    const text = validateMemoryText(record.text);
    return {
      id: record.id,
      text,
      ...(record.projectId ? { projectId: record.projectId } : {}),
      sourceType: record.sourceType,
      sourceId: record.sourceId,
      turnId: record.turnId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  } catch {
    return null;
  }
}

async function decryptSnapshot(raw: string): Promise<{ data: PersistedMemory; revision: number; discardedRecords: number }> {
  const envelope = parseEnvelope(raw);
  const iv = fromBase64(envelope.iv);
  if (iv.byteLength !== 12) throw new Error("invalid iv");
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: snapshotAad(envelope.revision),
    },
    await getEncryptionKey(),
    toArrayBuffer(fromBase64(envelope.data)),
  );
  const parsed: unknown = JSON.parse(new TextDecoder().decode(decrypted));
  if (!isPlainObject(parsed) || typeof parsed.enabled !== "boolean" || !Array.isArray(parsed.records)) {
    throw new Error("invalid memory data");
  }
  if (parsed.records.length > MAX_MEMORY_RECORDS) throw new Error("too many memories");
  const parsedRecords = parsed.records.map(parseMemoryRecord);
  const records = parsedRecords.filter((record): record is MemoryRecord => record !== null);
  const turns = parsed.processedTurns === undefined ? [] : parsed.processedTurns;
  if (
    !Array.isArray(turns) ||
    turns.length > MAX_PROCESSED_TURNS ||
    turns.some((turn) => typeof turn !== "string" || turn.length > MAX_SOURCE_ID_LENGTH + MAX_TURN_ID_LENGTH + 24)
  ) throw new Error("invalid processed turns");
  return {
    data: {
      enabled: parsed.enabled,
      records,
      processedTurns: turns as string[],
    },
    revision: envelope.revision,
    discardedRecords: parsedRecords.length - records.length,
  };
}

function genericStorageError(): string {
  return "Veyra could not read or save encrypted memory storage. The existing file was left untouched.";
}

function unsupportedVersionError(): string {
  return "A memory snapshot uses a version this Veyra build cannot read. It was left untouched.";
}

function saveError(): string {
  return `${skippedRecordWarning ? `${skippedRecordWarning} ` : ""}Veyra could not save encrypted memory storage. Your visible changes were restored; retry the save before trying again.`;
}

async function readCandidates(): Promise<SnapshotCandidates> {
  return invoke<SnapshotCandidates>("load_memory_snapshots");
}

function processedTurnKey(input: Pick<MemoryTurnInput, "sourceType" | "sourceId" | "turnId">): string {
  return JSON.stringify([input.sourceType, input.sourceId, input.turnId]);
}

function createPersistedSnapshot(): PersistedMemory {
  const state = useMemoryStore.getState();
  return {
    enabled: state.enabled,
    records: state.records,
    processedTurns: [...processedTurns],
  };
}

function enqueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const operation = mutationQueue.catch(() => undefined).then(mutation);
  mutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function persistSnapshot(snapshot: PersistedMemory, mirrorBoth = false): Promise<void> {
  if (writesBlockedForRecovery) throw new Error(recoveryBlockError ?? genericStorageError());
  try {
    const mustMirror = mirrorBoth || needsMirroredRetry || skippedRecordWarning !== null;
    const encrypted = await encryptSnapshot(snapshot);
    if (new TextEncoder().encode(encrypted).byteLength > MAX_SNAPSHOT_BYTES) {
      throw new Error("memory snapshot too large");
    }
    await invoke("save_memory_snapshot", {
      memoryJson: encrypted,
      preserveBackup: !mustMirror && needsRepairFromBackup,
      mirrorBoth: mustMirror,
    });
    needsRepairFromBackup = false;
    needsMirroredRetry = false;
    skippedRecordWarning = null;
    useMemoryStore.setState({ error: null });
  } catch {
    needsMirroredRetry = true;
    useMemoryStore.setState({ error: saveError() });
    throw new Error(saveError());
  }
}

async function persistCurrentSnapshot(mirrorBoth = false): Promise<void> {
  await persistSnapshot(createPersistedSnapshot(), mirrorBoth);
}

async function ensureInitialized(): Promise<void> {
  if (!initialized) await useMemoryStore.getState().initialize();
  if (writesBlockedForRecovery) throw new Error(recoveryBlockError ?? genericStorageError());
}

async function mutateAndPersist(
  mutation: () => void,
  options: { mirrorBoth?: boolean; clearTurns?: boolean } = {},
): Promise<void> {
  await ensureInitialized();
  return enqueueMutation(async () => {
    await ensureInitialized();
    const previousRecords = useMemoryStore.getState().records;
    const previousTurns = processedTurns;
    mutation();
    if (options.clearTurns) processedTurns = [];
    try {
      await persistCurrentSnapshot(options.mirrorBoth);
    } catch (error) {
      // A disable request changes enabled synchronously outside this queue. Keep
      // that safety state while restoring the records from the failed edit.
      useMemoryStore.setState({ records: previousRecords, error: saveError() });
      processedTurns = previousTurns;
      throw error;
    }
  });
}

function isValidTurnInput(input: MemoryTurnInput): boolean {
  return (input.sourceType === "chat" || input.sourceType === "agent") &&
    typeof input.sourceId === "string" && input.sourceId.trim().length > 0 && input.sourceId.length <= MAX_SOURCE_ID_LENGTH &&
    typeof input.turnId === "string" && input.turnId.trim().length > 0 && input.turnId.length <= MAX_TURN_ID_LENGTH &&
    typeof input.model === "string" && input.model.trim().length > 0 && input.model.length <= 300 &&
    typeof input.providerId === "string" && input.providerId.trim().length > 0 && input.providerId.length <= 200 &&
    isValidProjectId(input.projectId);
}

export const useMemoryStore = create<MemoryStoreState>((set, get) => ({
  enabled: false,
  records: [],
  loading: true,
  error: null,

  setEnabled: (enabled) => {
    const requestVersion = ++enabledRequestVersion;
    pendingEnabledRequest = enabled;
    if (!enabled) set({ enabled: false });
    return enqueueMutation(async () => {
      if (requestVersion !== enabledRequestVersion) return;
      await ensureInitialized();
      if (requestVersion !== enabledRequestVersion) return;

      if (enabled) set({ enabled: true });
      else set({ enabled: false });
      try {
        await persistCurrentSnapshot(!enabled);
        if (requestVersion === enabledRequestVersion) pendingEnabledRequest = null;
      } catch (error) {
        if (requestVersion === enabledRequestVersion) {
          if (enabled) set({ enabled: false });
          pendingEnabledRequest = enabled ? null : false;
          if (!enabled) {
            set({ error: `${skippedRecordWarning ? `${skippedRecordWarning} ` : ""}Memory is disabled for this session, but Veyra could not persist the disabled state. Retry the save to persist it.` });
          }
        }
        throw error;
      }
    });
  },

  initialize: async () => {
    if (initialized) return;
    initializationPromise ??= (async () => {
      set({ loading: true, error: null });
      writesBlockedForRecovery = false;
      recoveryBlockError = null;
      let candidates: SnapshotCandidates;
      try {
        candidates = await readCandidates();
      } catch {
        writesBlockedForRecovery = true;
        recoveryBlockError = genericStorageError();
        set({ loading: false, error: genericStorageError(), enabled: false, records: [] });
        throw new Error(genericStorageError());
      }

      const sources = [
        { name: "primary", raw: candidates.primary, priority: 2 },
        { name: "backup", raw: candidates.backup, priority: 1 },
      ].filter((source): source is { name: string; raw: string; priority: number } => Boolean(source.raw));
      if (sources.length === 0) {
        if (candidates.primaryError || candidates.backupError) {
          writesBlockedForRecovery = true;
          recoveryBlockError = genericStorageError();
          set({ loading: false, error: genericStorageError(), enabled: false, records: [] });
          throw new Error(genericStorageError());
        }
        processedTurns = [];
        initialized = true;
        needsRepairFromBackup = false;
        set({ loading: false, error: null, enabled: false, records: [] });
        return;
      }

      const valid: Array<{
        name: string;
        priority: number;
        data: PersistedMemory;
        revision: number;
        discardedRecords: number;
      }> = [];
      let unsupportedVersionFound = false;
      for (const source of sources) {
        try {
          const decoded = await decryptSnapshot(source.raw);
          valid.push({ name: source.name, priority: source.priority, ...decoded });
        } catch (error) {
          if (error instanceof UnsupportedMemoryEnvelopeVersionError) unsupportedVersionFound = true;
          // Try the other encrypted copy before treating the store as unrecoverable.
        }
      }
      if (valid.length === 0) {
        writesBlockedForRecovery = true;
        const error = unsupportedVersionFound ? unsupportedVersionError() : genericStorageError();
        recoveryBlockError = error;
        set({ loading: false, error, enabled: false, records: [] });
        throw new Error(error);
      }
      valid.sort((left, right) => right.revision - left.revision || right.priority - left.priority);
      const selected = valid[0];
      processedTurns = selected.data.processedTurns;
      lastRevision = Math.max(lastRevision, selected.revision);
      initialized = true;
      writesBlockedForRecovery = unsupportedVersionFound;
      recoveryBlockError = unsupportedVersionFound ? unsupportedVersionError() : null;
      needsRepairFromBackup = selected.name !== "primary";
      const warnings: string[] = [];
      if (unsupportedVersionFound) warnings.push(unsupportedVersionError());
      if (selected.discardedRecords > 0) {
        skippedRecordWarning = `${selected.discardedRecords} invalid memory record${selected.discardedRecords === 1 ? " was" : "s were"} skipped. Save or edit memories to repair the snapshot.`;
        warnings.push(skippedRecordWarning);
      } else {
        skippedRecordWarning = null;
      }
      if (pendingEnabledRequest === false) {
        set({
          loading: false,
          error: warnings.length > 0 ? warnings.join(" ") : null,
          enabled: false,
          records: selected.data.records,
        });
        return;
      }
      set({
        loading: false,
        error: warnings.length > 0 ? warnings.join(" ") : null,
        enabled: selected.data.enabled,
        records: selected.data.records,
      });
    })().finally(() => {
      initializationPromise = null;
    });
    await initializationPromise;
  },

  addMemory: async (rawText, projectId) => {
    const text = validateMemoryText(rawText);
    if (!isValidProjectId(projectId)) throw new Error("Invalid project memory scope.");
    await mutateAndPersist(() => {
      const records = get().records;
      const existing = records.find((record) =>
        record.projectId === projectId && record.text.toLocaleLowerCase() === text.toLocaleLowerCase(),
      );
      if (existing) return;
      if (records.length >= MAX_MEMORY_RECORDS) throw new Error("Memory storage is full.");
      const now = Date.now();
      const record: MemoryRecord = {
        id: crypto.randomUUID(),
        text,
        ...(projectId ? { projectId } : {}),
        sourceType: "chat",
        sourceId: "manual",
        turnId: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      set({ records: [...records, record] });
    });
  },

  updateMemory: async (id, rawText) => {
    invalidatePendingMemoryExtraction();
    const text = validateMemoryText(rawText);
    await mutateAndPersist(() => {
      const existing = get().records.find((record) => record.id === id);
      if (!existing) throw new Error("Memory was not found.");
      if (existing.text === text) return;
      const records = get().records.map((record) => record.id === id ? { ...record, text, updatedAt: Date.now() } : record);
      set({ records });
    }, { mirrorBoth: true });
  },

  deleteMemory: async (id) => {
    invalidatePendingMemoryExtraction();
    await mutateAndPersist(() => {
      const records = get().records.filter((record) => record.id !== id);
      if (records.length !== get().records.length) set({ records });
    }, { mirrorBoth: true });
  },

  clearMemories: async (projectId) => {
    invalidatePendingMemoryExtraction();
    await mutateAndPersist(() => {
      const records = projectId === undefined
        ? []
        : get().records.filter((record) => record.projectId !== projectId);
      if (records.length !== get().records.length) set({ records });
    }, { mirrorBoth: true, clearTurns: projectId === undefined });
  },

  retrySave: async () => {
    await ensureInitialized();
    return enqueueMutation(async () => {
      await ensureInitialized();
      if (pendingEnabledRequest === false) set({ enabled: false });
      await persistCurrentSnapshot(needsMirroredRetry || pendingEnabledRequest === false);
      if (pendingEnabledRequest === false) pendingEnabledRequest = null;
    });
  },
}));

/** Checks and commits are kept in the encrypted store so even fact-free turns deduplicate after restart. */
export async function hasProcessedMemoryTurn(input: Pick<MemoryTurnInput, "sourceType" | "sourceId" | "turnId">): Promise<boolean> {
  await ensureInitialized();
  const key = processedTurnKey(input);
  return processedTurns.includes(key) || useMemoryStore.getState().records.some((record) =>
    record.sourceType === input.sourceType && record.sourceId === input.sourceId && record.turnId === input.turnId,
  );
}

function processedTurnBelongsToSource(key: string, sourceType: "chat" | "agent", sourceId: string): boolean {
  try {
    const decoded: unknown = JSON.parse(key);
    return Array.isArray(decoded) && decoded[0] === sourceType && decoded[1] === sourceId;
  } catch {
    return false;
  }
}

/** Purges memories and deduplication entries associated with a deleted chat or agent. */
export async function removeMemoriesBySource(sourceType: "chat" | "agent", sourceId: string): Promise<void> {
  if (!sourceId.trim()) return;
  await ensureInitialized();
  return enqueueMutation(async () => {
    await ensureInitialized();
    const records = useMemoryStore.getState().records.filter((record) =>
      record.sourceType !== sourceType || record.sourceId !== sourceId,
    );
    const turns = processedTurns.filter((key) => !processedTurnBelongsToSource(key, sourceType, sourceId));
    if (records.length === useMemoryStore.getState().records.length && turns.length === processedTurns.length) return;
    const previousRecords = useMemoryStore.getState().records;
    const previousTurns = processedTurns;
    useMemoryStore.setState({ records });
    processedTurns = turns;
    try {
      await persistCurrentSnapshot(true);
    } catch (error) {
      useMemoryStore.setState({ records: previousRecords, error: saveError() });
      processedTurns = previousTurns;
      throw error;
    }
  });
}

export async function commitExtractedMemories(
  input: MemoryTurnInput,
  rawFacts: string[],
  canCommit: () => boolean = () => true,
): Promise<boolean> {
  await ensureInitialized();
  return enqueueMutation(async () => {
    await ensureInitialized();
    if (!useMemoryStore.getState().enabled || !isValidTurnInput(input) || !canCommit() ||
      isMemorySourceDeleted(input.sourceType, input.sourceId, input.projectId)) return false;
    const key = processedTurnKey(input);
    if (processedTurns.includes(key) || useMemoryStore.getState().records.some((record) =>
      record.sourceType === input.sourceType && record.sourceId === input.sourceId && record.turnId === input.turnId,
    )) return false;

    const previousRecords = useMemoryStore.getState().records;
    const previousTurns = processedTurns;
    const now = Date.now();
    const records = [...previousRecords];
    const accepted = new Set<string>();
    for (const rawFact of rawFacts.slice(0, 5)) {
      try {
        const text = validateMemoryText(rawFact);
        const normalized = text.toLocaleLowerCase();
        if (accepted.has(normalized)) continue;
        accepted.add(normalized);
        if (records.some((record) => record.projectId === input.projectId && record.text.toLocaleLowerCase() === normalized)) continue;
        if (records.length >= MAX_MEMORY_RECORDS) break;
        records.push({
          id: crypto.randomUUID(),
          text,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          turnId: input.turnId,
          createdAt: now,
          updatedAt: now,
        });
      } catch {
        // Invalid model output is ignored; only validated short facts are stored.
      }
    }
    processedTurns = [...processedTurns, key].slice(-MAX_PROCESSED_TURNS);
    useMemoryStore.setState({ records });
    try {
      await persistCurrentSnapshot();
    } catch (error) {
      useMemoryStore.setState({ records: previousRecords, error: saveError() });
      processedTurns = previousTurns;
      throw error;
    }
    return true;
  });
}
