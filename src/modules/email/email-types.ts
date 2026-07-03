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
