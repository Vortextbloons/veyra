export type PresentationMode = "standard" | "studio";

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
};

export type StudioValidationIssue = {
  code: string;
  message: string;
};

export type StudioRenderState = "empty" | "generating" | "validating" | "ready" | "rejected";

