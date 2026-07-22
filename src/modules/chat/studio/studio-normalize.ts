import type { Conversation } from "@/modules/chat/chat-types";
import type { StudioArtifact, StudioRevision } from "./studio-types";

export const STUDIO_MAX_REVISIONS = 20;

function isStudioRevision(value: unknown): value is StudioRevision {
  if (!value || typeof value !== "object") return false;
  const revision = value as StudioRevision;
  return (
    typeof revision.revision === "number" &&
    Number.isFinite(revision.revision) &&
    typeof revision.title === "string" &&
    typeof revision.html === "string" &&
    typeof revision.css === "string" &&
    typeof revision.createdAt === "number" &&
    typeof revision.assistantMessageId === "string"
  );
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

export function normalizeConversationStudio(conversation: Conversation): Conversation {
  const presentationMode = conversation.presentationMode === "studio" ? "studio" : "standard";
  const messageIds = new Set(conversation.messages.map((message) => message.id));
  const studioArtifact = reconcileStudioArtifactWithMessages(
    normalizeStudioArtifact(conversation.studioArtifact),
    messageIds,
  );
  return {
    ...conversation,
    presentationMode,
    studioArtifact,
  };
}

export function previousStudioRevision(artifact: StudioArtifact): StudioRevision | null {
  const sorted = [...artifact.revisions].sort((a, b) => a.revision - b.revision);
  const index = sorted.findIndex((revision) => revision.revision === artifact.currentRevision);
  return index > 0 ? sorted[index - 1]! : null;
}
