export type EmailAccount = {
  id: string;
  name: string;
  email: string;
  provider: "gmail" | "outlook" | "imap" | string;
  status: "connected" | "disconnected" | "syncing";
  avatar?: string;
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

export type EmailFolder = "inbox" | "sent" | "drafts" | "archive" | "starred";
