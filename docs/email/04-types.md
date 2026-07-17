# Email Key Types

From `src/modules/email/email-types.ts`:

```typescript
interface EmailAccount {
  id: string;
  name: string;
  email: string;
  provider: "gmail" | "outlook" | "imap" | string;
  status: "connected" | "disconnected" | "syncing";
  avatar?: string;
  syncStatus?: "idle" | "syncing" | "error";
  lastSyncAt?: string;
  aiEnabled?: boolean;
}

interface EmailThread {
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
}

interface EmailMessage {
  id: string;
  threadId: string;
  accountId: string;
  from: EmailParticipant;
  to: EmailParticipant[];
  cc?: EmailParticipant[];
  subject: string;
  body: string;
  snippet: string;
  timestamp: number;
  isRead: boolean;
  isArchived: boolean;
  isStarred: boolean;
  labels?: string[];
  attachments?: EmailAttachment[];
  bodyHtml?: string;
  sanitizedHtml?: string;
  bodyParseStatus?: string;
  parsedParts?: ParsedParts;
}

interface EmailParticipant {
  name: string;
  email: string;
}

interface EmailDraft {
  id: string;
  accountId: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface EmailAttachment {
  id: string;
  accountId: string;
  threadId: string;
  messageId: string;
  providerAttachmentId?: string;
  filename: string;
  mimeType: string;
  size: number;
  localPath?: string;
  downloadStatus: string;
  extractStatus: string;
  extractedText?: string;
  extractedTextChars: number;
  error?: string;
}

interface EmailFolder {
  id: string;
  accountId: string;
  providerId: string;
  name: string;
  kind: string;  /* inbox, sent, drafts, archive, trash, spam, starred, important, all, custom */
  type: string;
  isSystem: boolean;
  isVisible: boolean;
  unreadCount: number;
  totalCount: number;
}
```
