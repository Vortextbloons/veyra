export type EmailAccount = {
  id: string;
  name: string;
  email: string;
  provider: "gmail" | "outlook" | "imap" | string;
  status: "connected" | "disconnected" | "syncing";
  avatar?: string;
  syncStatus?: "idle" | "syncing" | "error";
  lastSyncAt?: number;
  aiEnabled?: boolean;
};

export type EmailFolder = {
  id: string;
  accountId: string;
  providerId: string;
  name: string;
  kind:
    | "inbox"
    | "sent"
    | "drafts"
    | "trash"
    | "spam"
    | "archive"
    | "starred"
    | "important"
    | "category"
    | "custom"
    | "unknown";
  type: "system" | "user";
  isSystem: boolean;
  isVisible: boolean;
  unreadCount: number;
  totalCount: number;
};

export type EmailAttachment = {
  id: string;
  accountId: string;
  threadId: string;
  messageId: string;
  providerAttachmentId?: string;
  filename: string;
  mimeType: string;
  size: number;
  localPath?: string;
  downloadStatus:
    | "metadata"
    | "queued"
    | "downloading"
    | "downloaded"
    | "failed";
  extractStatus:
    | "not_started"
    | "queued"
    | "extracting"
    | "extracted"
    | "unsupported"
    | "failed";
  extractedText?: string;
  extractedTextChars: number;
  error?: string;
};

export type ParsedParts = {
  latestReply: string;
  quotedHtml: string;
  signature: string;
  forwarded: string;
  parseStatus: "parsed" | "fallback" | "failed";
};

export type EmailMessage = {
  id: string;
  threadId: string;
  accountId: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc?: { name: string; email: string }[];
  subject: string;
  body: string;
  snippet: string;
  timestamp: number;
  isRead: boolean;
  isArchived: boolean;
  isStarred: boolean;
  labels?: string[];
  attachments?: { filename: string; size: number; mimeType: string }[];
  bodyHtml?: string;
  sanitizedHtml?: string;
  bodyParseStatus?: string;
  parsedParts?: ParsedParts;
};

export type EmailThread = {
  id: string;
  accountId: string;
  subject: string;
  messages: EmailMessage[];
  participants: string[];
  lastMessageAt: number;
  isRead: boolean;
  isArchived: boolean;
  isStarred: boolean;
  labels: string[];
  aiMetadata?: EmailThreadAiMetadata;
};

export type EmailThreadAiMetadata = {
  summary?: string;
  urgency?: string;
  category?: string;
  tags: string[];
  needsReply?: boolean;
  spamScore?: number;
  marketingScore?: number;
  newsletter?: boolean;
};

export type EmailDraft = {
  id: string;
  accountId: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  createdAt: number;
  updatedAt: number;
};

export type EmailAiJob = {
  id: string;
  accountId: string;
  threadId?: string;
  messageId?: string;
  attachmentId?: string;
  taskType: string;
  priority: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  modelId?: string;
  tone?: string;
  attemptCount: number;
  maxAttempts: number;
  scheduledAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  inputHash?: string;
  createdAt: number;
};

export type EmailAiOutput = {
  id: string;
  accountId: string;
  threadId?: string;
  messageId?: string;
  attachmentId?: string;
  taskType: string;
  modelId: string;
  promptVersion: string;
  sourceMessageIdsJson: string;
  confidence?: number;
  resultJson: string;
  displayText: string;
  createdAt: number;
  updatedAt: number;
};

export type EmailAiJobInput = {
  accountId: string;
  threadId?: string;
  messageId?: string;
  taskType: string;
  priority: number;
  modelId?: string;
  tone?: string;
};

export type EmailAiOutputInput = {
  jobId: string;
  modelId: string;
  promptVersion: string;
  sourceMessageIdsJson?: string;
  confidence?: number;
  resultJson: string;
  displayText: string;
};

export type EmailAiDraft = {
  id: string;
  accountId: string;
  threadId: string;
  messageId?: string;
  modelId: string;
  tone: string;
  toJson: string;
  ccJson: string;
  bccJson: string;
  subject: string;
  body: string;
  status: "suggested" | "inserted" | "edited" | "dismissed";
  createdAt: number;
  updatedAt: number;
};

export type EmailAiDraftGenerateInput = {
  accountId: string;
  threadId: string;
  tone?: string;
};

export type EmailSaveAiDraftInput = {
  jobId: string;
  accountId: string;
  threadId: string;
  messageId?: string;
  modelId: string;
  tone: string;
  toJson: string;
  ccJson: string;
  bccJson: string;
  subject: string;
  body: string;
};

export type EmailAiJobFilter = {
  accountId?: string;
  status?: string;
  taskType?: string;
  limit?: number;
};

export type EmailAiTaskCoverage = {
  taskType: string;
  label: string;
  covered: number;
  queued: number;
  running: number;
  pending: number;
  failed: number;
};

export type EmailAiCoverageSnapshot = {
  tasks: EmailAiTaskCoverage[];
  activeJobs: EmailAiJob[];
  totalThreads: number;
  loadedAt: number;
};

export type EmailTag = {
  id: string;
  accountId?: string;
  name: string;
  slug: string;
  color?: string;
  source: "system" | "ai" | "user" | "rule" | "provider";
  createdAt: number;
  updatedAt: number;
};

export type EmailCreateTagInput = {
  accountId?: string;
  name: string;
  color?: string;
  source: string;
};

export type EmailUpdateTagInput = {
  tagId: string;
  name?: string;
  color?: string;
};

export type EmailApplyTagInput = {
  messageId: string;
  tagId: string;
  source: string;
  confidence?: number;
  reason?: string;
};

export type EmailRemoveTagInput = {
  messageId: string;
  tagId: string;
};

export type SmartView =
  | "urgent"
  | "spam"
  | "marketing"
  | "needs_reply"
  | "has_attachments";
