/**
 * Conversation presentation/response expectations within normal chat.
 * Distinct from `ChatMode` (operational system).
 */
export type ConversationExperience = "standard" | "studio";

/** Identifies the conversation domain for specialized Studio integration. */
export type StudioContextMode = "chat" | "character" | "research" | "project" | "document";

export type StudioValidationIssue = {
  code: string;
  message: string;
};

/** Message-owned Studio response status. */
export type StudioResponseStatus =
  | "generating"
  | "validating"
  | "ready"
  | "rejected"
  | "render_error";

/** Immutable validated source for one revision of a message-owned Studio response. */
export type StudioResponseRevision = {
  revision: number;
  title: string;
  html: string;
  css: string;
  createdAt: number;
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
