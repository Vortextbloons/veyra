import type { ChatMessage, Conversation } from "@/modules/chat/chat-types";
import type {
  ConversationExperience,
  StudioArtifact,
  StudioResponse,
  StudioResponseRevision,
  StudioResponseStatus,
  StudioRevision,
  StudioValidationIssue,
} from "./studio-types";

/** Legacy conversation-level revision retention. */
export const STUDIO_MAX_REVISIONS = 20;

/** Message-owned Studio response revision retention. */
export const STUDIO_MAX_RESPONSE_REVISIONS = 8;

const STUDIO_RESPONSE_STATUSES: ReadonlySet<StudioResponseStatus> = new Set([
  "generating",
  "validating",
  "ready",
  "rejected",
  "render_error",
]);

export type StudioMigrationStats = {
  nativeResponses: number;
  migratedGroups: number;
  unmatchedRevisions: number;
  discardedMalformedRevisions: number;
  fallbackAttachments: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStudioRevision(value: unknown): value is StudioRevision {
  if (!value || typeof value !== "object") return false;
  const revision = value as StudioRevision;
  return (
    isFiniteNumber(revision.revision) &&
    typeof revision.title === "string" &&
    typeof revision.html === "string" &&
    typeof revision.css === "string" &&
    isFiniteNumber(revision.createdAt) &&
    typeof revision.assistantMessageId === "string"
  );
}

function isStudioResponseRevision(value: unknown): value is StudioResponseRevision {
  if (!value || typeof value !== "object") return false;
  const revision = value as StudioResponseRevision;
  return (
    isFiniteNumber(revision.revision) &&
    typeof revision.title === "string" &&
    typeof revision.html === "string" &&
    typeof revision.css === "string" &&
    isFiniteNumber(revision.createdAt) &&
    (revision.assistantMessageId === undefined || typeof revision.assistantMessageId === "string")
  );
}

function normalizeValidationIssues(raw: unknown): StudioValidationIssue[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const issues: StudioValidationIssue[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const issue = entry as Partial<StudioValidationIssue>;
    if (typeof issue.code !== "string" || typeof issue.message !== "string") continue;
    issues.push({ code: issue.code, message: issue.message });
  }
  return issues.length > 0 ? issues : undefined;
}

/**
 * Resolve conversation experience.
 * Native `experience` wins; missing experience may fall back to legacy `presentationMode`.
 * Unrecognized native experience normalizes to `standard` (no legacy fallback).
 */
export function resolveConversationExperience(input: {
  experience?: unknown;
  presentationMode?: unknown;
}): ConversationExperience {
  if (input.experience === "studio" || input.experience === "standard") {
    return input.experience;
  }
  if (input.experience != null) {
    return "standard";
  }
  if (input.presentationMode === "studio") {
    return "studio";
  }
  return "standard";
}

export function trimStudioRevisions(revisions: StudioRevision[], currentRevision: number): StudioRevision[] {
  if (revisions.length <= STUDIO_MAX_REVISIONS) {
    return [...revisions].sort((a, b) => a.revision - b.revision);
  }
  const sorted = [...revisions].sort((a, b) => a.revision - b.revision);
  const retained = sorted.slice(-STUDIO_MAX_REVISIONS);
  if (retained.some((revision) => revision.revision === currentRevision)) {
    return retained;
  }
  const current = sorted.find((revision) => revision.revision === currentRevision);
  if (!current) return retained;
  return [...retained.slice(1), current].sort((a, b) => a.revision - b.revision);
}

export function trimStudioResponseRevisions(
  revisions: StudioResponseRevision[],
  currentRevision: number,
  maxRevisions = STUDIO_MAX_RESPONSE_REVISIONS,
): StudioResponseRevision[] {
  if (revisions.length <= maxRevisions) {
    return [...revisions].sort((a, b) => a.revision - b.revision);
  }
  const sorted = [...revisions].sort((a, b) => a.revision - b.revision);
  const retained = sorted.slice(-maxRevisions);
  if (retained.some((revision) => revision.revision === currentRevision)) {
    return retained;
  }
  const current = sorted.find((revision) => revision.revision === currentRevision);
  if (!current) return retained;
  return [...retained.slice(1), current].sort((a, b) => a.revision - b.revision);
}

export function normalizeStudioArtifact(raw: unknown): StudioArtifact | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const artifact = raw as Partial<StudioArtifact>;
  if (typeof artifact.id !== "string" || !artifact.id.trim()) return undefined;

  const deduped = new Map<number, StudioRevision>();
  for (const revision of Array.isArray(artifact.revisions) ? artifact.revisions : []) {
    if (!isStudioRevision(revision)) continue;
    deduped.set(revision.revision, revision);
  }
  const revisions = [...deduped.values()].sort((a, b) => a.revision - b.revision);
  if (revisions.length === 0) return undefined;

  const latestRevision = revisions[revisions.length - 1]!.revision;
  let currentRevision =
    typeof artifact.currentRevision === "number" ? artifact.currentRevision : latestRevision;
  if (!revisions.some((revision) => revision.revision === currentRevision)) {
    currentRevision = latestRevision;
  }

  const trimmed = trimStudioRevisions(revisions, currentRevision);
  const trimmedCurrent = trimmed.some((revision) => revision.revision === currentRevision)
    ? currentRevision
    : trimmed[trimmed.length - 1]!.revision;
  const current = trimmed.find((revision) => revision.revision === trimmedCurrent) ?? trimmed[trimmed.length - 1]!;

  return {
    id: artifact.id,
    title: current.title,
    currentRevision: trimmedCurrent,
    latestRevision: trimmed[trimmed.length - 1]!.revision,
    revisions: trimmed,
    createdAt: typeof artifact.createdAt === "number" ? artifact.createdAt : current.createdAt,
    updatedAt: typeof artifact.updatedAt === "number" ? artifact.updatedAt : current.createdAt,
    mode: typeof artifact.mode === "string" ? (artifact.mode as StudioArtifact["mode"]) : undefined,
  };
}

export function normalizeStudioResponse(
  raw: unknown,
  options?: { discardedMalformedRevisions?: { count: number } },
): StudioResponse | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const response = raw as Partial<StudioResponse>;
  if (typeof response.id !== "string" || !response.id.trim()) return undefined;

  const deduped = new Map<number, StudioResponseRevision>();
  let discarded = 0;
  for (const revision of Array.isArray(response.revisions) ? response.revisions : []) {
    if (!isStudioResponseRevision(revision)) {
      discarded += 1;
      continue;
    }
    deduped.set(revision.revision, {
      revision: revision.revision,
      title: revision.title,
      html: revision.html,
      css: revision.css,
      createdAt: revision.createdAt,
      ...(typeof revision.assistantMessageId === "string"
        ? { assistantMessageId: revision.assistantMessageId }
        : {}),
    });
  }
  if (options?.discardedMalformedRevisions) {
    options.discardedMalformedRevisions.count += discarded;
  }

  const revisions = [...deduped.values()].sort((a, b) => a.revision - b.revision);
  if (revisions.length === 0) return undefined;

  const latestRevision = revisions[revisions.length - 1]!.revision;
  let currentRevision =
    typeof response.currentRevision === "number" ? response.currentRevision : latestRevision;
  if (!revisions.some((revision) => revision.revision === currentRevision)) {
    currentRevision = latestRevision;
  }

  const trimmed = trimStudioResponseRevisions(revisions, currentRevision);
  const trimmedCurrent = trimmed.some((revision) => revision.revision === currentRevision)
    ? currentRevision
    : trimmed[trimmed.length - 1]!.revision;
  const current = trimmed.find((revision) => revision.revision === trimmedCurrent) ?? trimmed[trimmed.length - 1]!;

  const status: StudioResponseStatus =
    typeof response.status === "string" && STUDIO_RESPONSE_STATUSES.has(response.status as StudioResponseStatus)
      ? (response.status as StudioResponseStatus)
      : "ready";

  return {
    id: response.id,
    title: current.title,
    currentRevision: trimmedCurrent,
    latestRevision: trimmed[trimmed.length - 1]!.revision,
    revisions: trimmed,
    status,
    error: normalizeValidationIssues(response.error),
    createdAt: typeof response.createdAt === "number" ? response.createdAt : current.createdAt,
    updatedAt: typeof response.updatedAt === "number" ? response.updatedAt : current.createdAt,
  };
}

export function reconcileStudioArtifactWithMessages(
  artifact: StudioArtifact | undefined,
  messageIds: Set<string>,
): StudioArtifact | undefined {
  if (!artifact) return undefined;
  const revisions = artifact.revisions.filter((revision) => messageIds.has(revision.assistantMessageId));
  if (revisions.length === 0) return undefined;

  const latestRevision = revisions[revisions.length - 1]!.revision;
  let currentRevision = artifact.currentRevision;
  if (!revisions.some((revision) => revision.revision === currentRevision)) {
    currentRevision = latestRevision;
  }
  const current = revisions.find((revision) => revision.revision === currentRevision) ?? revisions[revisions.length - 1]!;
  return {
    ...artifact,
    title: current.title,
    currentRevision,
    latestRevision,
    revisions: trimStudioRevisions(revisions, currentRevision),
    updatedAt: artifact.updatedAt,
    mode: artifact.mode,
  };
}

export function copyStudioArtifactForFork(
  artifact: StudioArtifact | undefined,
  messageIdMap: Map<string, string>,
): StudioArtifact | undefined {
  if (!artifact) return undefined;
  const revisions = artifact.revisions
    .filter((revision) => messageIdMap.has(revision.assistantMessageId))
    .map((revision) => ({
      ...revision,
      assistantMessageId: messageIdMap.get(revision.assistantMessageId)!,
    }));
  if (revisions.length === 0) return undefined;

  const latestRevision = revisions[revisions.length - 1]!.revision;
  let currentRevision = artifact.currentRevision;
  if (!revisions.some((revision) => revision.revision === currentRevision)) {
    currentRevision = latestRevision;
  }
  const current = revisions.find((revision) => revision.revision === currentRevision) ?? revisions[revisions.length - 1]!;
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: current.title,
    currentRevision,
    latestRevision,
    revisions,
    createdAt: now,
    updatedAt: now,
    mode: artifact.mode,
  };
}

export function copyStudioResponseForFork(response: StudioResponse | undefined): StudioResponse | undefined {
  if (!response) return undefined;
  const now = Date.now();
  return {
    ...response,
    id: crypto.randomUUID(),
    revisions: response.revisions.map((revision) => ({ ...revision })),
    error: response.error?.map((issue) => ({ ...issue })),
    createdAt: now,
    updatedAt: now,
  };
}

function stableMigratedResponseId(artifactId: string, assistantMessageId: string): string {
  return `${artifactId}:${assistantMessageId}`;
}

function studioResponseFromLegacyRevisions(
  artifactId: string,
  assistantMessageId: string,
  revisions: StudioRevision[],
): StudioResponse {
  const sorted = [...revisions].sort((a, b) => a.revision - b.revision);
  const mapped: StudioResponseRevision[] = sorted.map((revision) => ({
    revision: revision.revision,
    title: revision.title,
    html: revision.html,
    css: revision.css,
    createdAt: revision.createdAt,
    assistantMessageId: revision.assistantMessageId,
  }));
  const latest = mapped[mapped.length - 1]!;
  const trimmed = trimStudioResponseRevisions(mapped, latest.revision);
  const current = trimmed[trimmed.length - 1]!;
  return {
    id: stableMigratedResponseId(artifactId, assistantMessageId),
    title: current.title,
    currentRevision: current.revision,
    latestRevision: current.revision,
    revisions: trimmed,
    status: "ready",
    createdAt: trimmed[0]?.createdAt ?? current.createdAt,
    updatedAt: current.createdAt,
  };
}

/**
 * Attach legacy conversation artifact revisions onto matching assistant messages.
 * Native `studioResponse` data always wins. Idempotent across repeated calls.
 */
export function migrateLegacyStudioArtifactToMessages(
  messages: ChatMessage[],
  artifact: StudioArtifact | undefined,
): { messages: ChatMessage[]; stats: StudioMigrationStats } {
  const stats: StudioMigrationStats = {
    nativeResponses: 0,
    migratedGroups: 0,
    unmatchedRevisions: 0,
    discardedMalformedRevisions: 0,
    fallbackAttachments: 0,
  };

  const discardedCounter = { count: 0 };
  const normalizedNative = messages.map((message) => {
    if (!message.studioResponse) return message;
    const normalized = normalizeStudioResponse(message.studioResponse, {
      discardedMalformedRevisions: discardedCounter,
    });
    if (!normalized) {
      const { studioResponse: _removed, ...rest } = message;
      return rest;
    }
    stats.nativeResponses += 1;
    return { ...message, studioResponse: normalized };
  });
  stats.discardedMalformedRevisions = discardedCounter.count;

  if (!artifact || artifact.revisions.length === 0) {
    return { messages: normalizedNative, stats };
  }

  const groups = new Map<string, StudioRevision[]>();
  for (const revision of artifact.revisions) {
    const group = groups.get(revision.assistantMessageId) ?? [];
    group.push(revision);
    groups.set(revision.assistantMessageId, group);
  }

  const messageIds = new Set(normalizedNative.map((message) => message.id));
  let matchedRevisionCount = 0;
  const withMigrated = normalizedNative.map((message) => {
    if (message.studioResponse) return message;
    if (message.role !== "assistant") return message;
    const group = groups.get(message.id);
    if (!group || group.length === 0) return message;
    matchedRevisionCount += group.length;
    stats.migratedGroups += 1;
    return {
      ...message,
      studioResponse: studioResponseFromLegacyRevisions(artifact.id, message.id, group),
    };
  });

  stats.unmatchedRevisions = artifact.revisions.length - matchedRevisionCount;

  if (stats.migratedGroups > 0 || stats.nativeResponses > 0) {
    // Matched groups and/or native responses already cover recoverable data.
    // Unmatched producer IDs are left in the legacy artifact for recovery.
    return { messages: withMigrated, stats };
  }

  // No revision matched an assistant message: safe fallback to latest assistant.
  const latestAssistantIndex = (() => {
    for (let index = withMigrated.length - 1; index >= 0; index -= 1) {
      if (withMigrated[index]?.role === "assistant") return index;
    }
    return -1;
  })();

  if (latestAssistantIndex < 0) {
    return { messages: withMigrated, stats };
  }

  const latestAssistant = withMigrated[latestAssistantIndex]!;
  if (latestAssistant.studioResponse) {
    return { messages: withMigrated, stats };
  }

  stats.fallbackAttachments = 1;
  stats.unmatchedRevisions = 0;
  const fallback = studioResponseFromLegacyRevisions(
    artifact.id,
    latestAssistant.id,
    artifact.revisions,
  );
  const next = [...withMigrated];
  next[latestAssistantIndex] = {
    ...latestAssistant,
    studioResponse: {
      ...fallback,
      id: artifact.id,
    },
  };
  return { messages: next, stats };
}

export function normalizeConversationStudio(conversation: Conversation): Conversation {
  const experience = resolveConversationExperience(conversation);
  // Keep presentationMode aligned for existing Stage 1 UI paths; do not clear legacy recovery fields.
  const presentationMode = experience === "studio" ? "studio" : "standard";
  // Normalize the legacy artifact fully and retain it for recovery. Message migration
  // reads this copy before any live reconcile path strips orphan revisions.
  const studioArtifact = normalizeStudioArtifact(conversation.studioArtifact);

  const messages =
    experience === "studio"
      ? migrateLegacyStudioArtifactToMessages(conversation.messages, studioArtifact).messages
      : conversation.messages.map((message) => {
          if (!message.studioResponse) return message;
          const normalized = normalizeStudioResponse(message.studioResponse);
          if (!normalized) {
            const { studioResponse: _removed, ...rest } = message;
            return rest;
          }
          return { ...message, studioResponse: normalized };
        });

  return {
    ...conversation,
    experience,
    presentationMode,
    studioArtifact,
    messages,
  };
}

export function previousStudioRevision(artifact: StudioArtifact): StudioRevision | null {
  const sorted = [...artifact.revisions].sort((a, b) => a.revision - b.revision);
  const index = sorted.findIndex((revision) => revision.revision === artifact.currentRevision);
  return index > 0 ? sorted[index - 1]! : null;
}

export function previousStudioResponseRevision(response: StudioResponse): StudioResponseRevision | null {
  const sorted = [...response.revisions].sort((a, b) => a.revision - b.revision);
  const index = sorted.findIndex((revision) => revision.revision === response.currentRevision);
  return index > 0 ? sorted[index - 1]! : null;
}
