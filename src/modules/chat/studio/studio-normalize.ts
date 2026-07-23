import type { ChatMessage, Conversation } from "@/modules/chat/chat-types";
import type {
  ConversationExperience,
  StudioResponse,
  StudioResponseRevision,
  StudioResponseStatus,
  StudioValidationIssue,
  StudioScene,
  StudioWorkspace,
  StudioWorkspaceStatus,
} from "./studio-types";

/** Message-owned Studio response revision retention. */
export const STUDIO_MAX_RESPONSE_REVISIONS = 8;
export const STUDIO_MAX_SCENES = 12;
export const STUDIO_MAX_RETAINED_BYTES = 3 * 1024 * 1024;

const WORKSPACE_STATUSES: ReadonlySet<StudioWorkspaceStatus> = new Set(["idle", "generating", "validating", "transitioning", "rejected", "render_error"]);

function sceneBytes(scene: Pick<StudioScene, "html" | "css">): number {
  return new TextEncoder().encode(scene.html).byteLength + new TextEncoder().encode(scene.css).byteLength;
}

export function trimStudioScenes(scenes: StudioScene[], currentSceneId?: string): StudioScene[] {
  const retained: StudioScene[] = [];
  let bytes = 0;
  for (const scene of [...scenes].sort((a, b) => b.createdAt - a.createdAt)) {
    const size = sceneBytes(scene);
    if (retained.length >= STUDIO_MAX_SCENES || (retained.length > 0 && bytes + size > STUDIO_MAX_RETAINED_BYTES)) continue;
    retained.push(scene);
    bytes += size;
  }
  const current = scenes.find((scene) => scene.id === currentSceneId);
  if (current && !retained.some((scene) => scene.id === current.id)) retained[retained.length - 1] = current;
  return retained.sort((a, b) => a.createdAt - b.createdAt);
}

export function normalizeStudioWorkspace(raw: unknown, messageIds: Set<string>): StudioWorkspace | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<StudioWorkspace>;
  if (typeof value.id !== "string" || !value.id) return undefined;
  const scenes = (Array.isArray(value.scenes) ? value.scenes : []).filter((entry): entry is StudioScene => {
    if (!entry || typeof entry !== "object") return false;
    const scene = entry as StudioScene;
    return typeof scene.id === "string" && typeof scene.assistantMessageId === "string" && messageIds.has(scene.assistantMessageId) && typeof scene.title === "string" && typeof scene.html === "string" && typeof scene.css === "string" && typeof scene.createdAt === "number";
  }).map((scene) => ({ ...scene, transition: ["none", "fade", "dissolve", "slide"].includes(scene.transition) ? scene.transition : "fade", lineageId: scene.lineageId || scene.id, revision: Number.isFinite(scene.revision) ? scene.revision : 1 }));
  const retained = trimStudioScenes(scenes, value.currentSceneId);
  const latest = retained[retained.length - 1];
  const currentSceneId = retained.some((scene) => scene.id === value.currentSceneId) ? value.currentSceneId : latest?.id;
  const createdAt = typeof value.createdAt === "number" ? value.createdAt : latest?.createdAt ?? Date.now();
  return { id: value.id, scenes: retained, currentSceneId, latestSceneId: retained.some((scene) => scene.id === value.latestSceneId) ? value.latestSceneId : latest?.id, status: typeof value.status === "string" && WORKSPACE_STATUSES.has(value.status as StudioWorkspaceStatus) && value.status !== "transitioning" ? value.status as StudioWorkspaceStatus : "idle", error: normalizeValidationIssues(value.error), createdAt, updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : createdAt };
}

const STUDIO_RESPONSE_STATUSES: ReadonlySet<StudioResponseStatus> = new Set([
  "generating",
  "validating",
  "ready",
  "rejected",
  "render_error",
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStudioResponseRevision(value: unknown): value is StudioResponseRevision {
  if (!value || typeof value !== "object") return false;
  const revision = value as StudioResponseRevision;
  return (
    isFiniteNumber(revision.revision) &&
    typeof revision.title === "string" &&
    typeof revision.html === "string" &&
    typeof revision.css === "string" &&
    isFiniteNumber(revision.createdAt)
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
 * Native `experience` wins; missing or unrecognized normalizes to `standard`.
 */
export function resolveConversationExperience(input: {
  experience?: unknown;
}): ConversationExperience {
  if (input.experience === "studio" || input.experience === "standard") {
    return input.experience;
  }
  return "standard";
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

export function normalizeConversationStudio(conversation: Conversation): Conversation {
  const experience = resolveConversationExperience(conversation);
  const messages = conversation.messages.map<ChatMessage>((message) => {
    if (!message.studioResponse) return message;
    const normalized = normalizeStudioResponse(message.studioResponse);
    if (!normalized) {
      const { studioResponse: _removed, ...rest } = message;
      return rest;
    }
    return { ...message, studioResponse: normalized };
  });
  let studioWorkspace = normalizeStudioWorkspace(conversation.studioWorkspace, new Set(messages.map((message) => message.id)));
  // Development cutover: lift valid legacy message-owned revisions into one conversation timeline.
  if (experience === "studio" && !studioWorkspace) {
    const scenes: StudioScene[] = [];
    for (const message of messages) {
      if (message.role !== "assistant" || !message.studioResponse) continue;
      for (const revision of message.studioResponse.revisions) scenes.push({ id: crypto.randomUUID(), assistantMessageId: message.id, title: revision.title, html: revision.html, css: revision.css, transition: "fade", lineageId: message.studioResponse.id, revision: revision.revision, createdAt: revision.createdAt });
    }
    if (scenes.length) { const latest = scenes[scenes.length - 1]!; studioWorkspace = { id: crypto.randomUUID(), scenes: trimStudioScenes(scenes, latest.id), currentSceneId: latest.id, latestSceneId: latest.id, status: "idle", createdAt: scenes[0]!.createdAt, updatedAt: latest.createdAt }; }
  }
  return { ...conversation, experience, messages, studioWorkspace };
}

export function previousStudioResponseRevision(response: StudioResponse): StudioResponseRevision | null {
  const sorted = [...response.revisions].sort((a, b) => a.revision - b.revision);
  const index = sorted.findIndex((revision) => revision.revision === response.currentRevision);
  return index > 0 ? sorted[index - 1]! : null;
}
