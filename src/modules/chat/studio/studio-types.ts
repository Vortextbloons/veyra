export type PresentationMode = "standard" | "studio";

/**
 * Conversation presentation/response expectations within normal chat.
 * Distinct from `ChatMode` (operational system) and from legacy `PresentationMode`.
 */
export type ConversationExperience = "standard" | "studio";

/** Identifies the conversation domain for specialized Studio integration. */
export type StudioContextMode = "chat" | "character" | "research" | "project" | "document";

/** Legacy conversation-level revision (compatibility / recovery). */
export type StudioRevision = {
  revision: number;
  title: string;
  html: string;
  css: string;
  createdAt: number;
  assistantMessageId: string;
};

/** Legacy conversation-level artifact (compatibility / recovery). */
export type StudioArtifact = {
  id: string;
  title: string;
  currentRevision: number;
  latestRevision: number;
  revisions: StudioRevision[];
  createdAt: number;
  updatedAt: number;
  /** Conversation domain that produced this artifact. */
  mode?: StudioContextMode;
};

export type StudioValidationIssue = {
  code: string;
  message: string;
};

/** Legacy global shell render state. */
export type StudioRenderState = "empty" | "generating" | "validating" | "ready" | "rejected";

/** Message-owned Studio response status. */
export type StudioResponseStatus =
  | "generating"
  | "validating"
  | "ready"
  | "rejected"
  | "render_error";

/**
 * Immutable validated source for one revision of a message-owned Studio response.
 * `assistantMessageId` is retained only as a temporary migration field.
 */
export type StudioResponseRevision = {
  revision: number;
  title: string;
  html: string;
  css: string;
  createdAt: number;
  assistantMessageId?: string;
};

/** Studio response owned by a single assistant message. */
export type StudioResponse = {
  id: string;
  title: string;
  currentRevision: number;
  latestRevision: number;
  revisions: StudioResponseRevision[];
  status: StudioResponseStatus;
  error?: StudioValidationIssue[];
  createdAt: number;
  updatedAt: number;
};
