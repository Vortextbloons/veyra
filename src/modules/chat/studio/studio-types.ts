export type PresentationMode = "standard" | "studio";

/** Identifies the conversation domain for specialized Studio integration. */
export type StudioContextMode = "chat" | "character" | "research" | "project" | "document";

export type StudioRevision = {
  revision: number;
  title: string;
  html: string;
  css: string;
  createdAt: number;
  assistantMessageId: string;
};

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

export type StudioRenderState = "empty" | "generating" | "validating" | "ready" | "rejected";

