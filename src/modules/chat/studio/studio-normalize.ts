import type { ChatMessage, Conversation } from "@/modules/chat/chat-types";
import type {
  ConversationExperience,
  StudioResponse,
  StudioResponseRevision,
  StudioResponseStatus,
  StudioValidationIssue,
} from "./studio-types";

/** Message-owned Studio response revision retention. */
export const STUDIO_MAX_RESPONSE_REVISIONS = 8;

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
  const messages = conversation.messages.map((message) => {
    if (!message.studioResponse) return message;
    const normalized = normalizeStudioResponse(message.studioResponse);
    if (!normalized) {
      const { studioResponse: _removed, ...rest } = message;
      return rest;
    }
    return { ...message, studioResponse: normalized };
  });
  return { ...conversation, experience, messages };
}

export function previousStudioResponseRevision(response: StudioResponse): StudioResponseRevision | null {
  const sorted = [...response.revisions].sort((a, b) => a.revision - b.revision);
  const index = sorted.findIndex((revision) => revision.revision === response.currentRevision);
  return index > 0 ? sorted[index - 1]! : null;
}
