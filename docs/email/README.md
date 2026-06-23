# Email Module

Email client with Gmail OAuth and IMAP support. Provides threads, compose/send, folder browsing, and sync.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/email/email-types.ts` | Type definitions |
| `src/modules/email/email-store.ts` | Zustand store |
| `src/modules/email/tauri-commands.ts` | Tauri IPC layer |
| `src/modules/email/components/` | UI components |

## Supported Providers

| Provider | Authentication |
|----------|---------------|
| Gmail | OAuth 2.0 |
| Outlook | IMAP |
| IMAP (generic) | Username/password |

## Account Fields

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `provider` | `gmail`, `outlook`, or `imap` |
| `email` | Email address |
| `displayName` | Display name |
| `status` | `connected`, `disconnected`, or `syncing` |
| `imapHost` | IMAP server (for IMAP accounts) |
| `smtpHost` | SMTP server |

## Gmail OAuth Setup

### Requirements
- Gmail OAuth client ID and client secret
- Required OAuth scopes:
  - `gmail.modify`
  - `gmail.send`
  - `gmail.compose`

### Connection Flow
1. **Configure OAuth**: User provides client ID and client secret
2. **Connect Gmail**: Opens browser for Google consent screen
3. **Receive callback**: OAuth tokens are stored securely
4. **Account created**: Gmail account appears in the email panel

### Scope Handling
- Veyra detects Gmail scope insufficiency
- Shows actionable error messages when scopes are missing
- Guides user through re-authorization

## IMAP Setup

For non-Gmail providers:
1. User provides IMAP and SMTP server details
2. Username and password authentication
3. Connection test to verify credentials

## Features

### Thread Viewing
- List threads by folder (Inbox, Drafts, Sent, etc.)
- Thread-based email model with participants
- Message history within threads
- Search across threads

### Compose and Send
- New message composition
- Fields: To, CC, BCC, Subject, Body
- Save as draft
- Send via SMTP

### Thread Operations
| Operation | Description |
|-----------|-------------|
| Archive | Move thread to archive |
| Mark Read | Mark thread as read |
| Mark Unread | Mark thread as unread |

### Folder Browsing
- Browse email folders
- Standard folders: Inbox, Sent, Drafts, Archive, Trash
- Custom folder support

### Sync
- Manual sync trigger
- Account-level sync status
- Error handling for sync failures

## Key Types

```typescript
interface EmailAccount {
  id: string
  provider: 'gmail' | 'outlook' | 'imap'
  email: string
  displayName: string
  status: 'connected' | 'disconnected' | 'syncing'
  imapHost?: string
  smtpHost?: string
}

interface EmailThread {
  id: string
  subject: string
  participants: EmailParticipant[]
  snippet: string
  isRead: boolean
  isArchived: boolean
  isStarred: boolean
  labels: string[]
  messageCount: number
  lastMessageAt: number
}

interface EmailMessage {
  id: string
  threadId: string
  from: EmailParticipant
  to: EmailParticipant[]
  cc?: EmailParticipant[]
  subject: string
  body: string
  snippet: string
  isRead: boolean
  attachments: EmailAttachment[]
  receivedAt: number
}

interface EmailDraft {
  id: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: string
}
```

## Tauri IPC Commands

| Command | Description |
|---------|-------------|
| `email_list_accounts` | List all email accounts |
| `email_add_account` | Add IMAP account |
| `email_remove_account` | Remove account |
| `email_configure_gmail_oauth` | Set Gmail OAuth credentials |
| `email_connect_gmail` | Initiate Gmail OAuth flow |
| `email_connect_gmail_with_config` | Connect with pre-configured OAuth |
| `email_has_gmail_oauth_config` | Check if OAuth is configured |
| `email_list_threads` | List threads in a folder |
| `email_get_thread` | Get full thread |
| `email_send_message` | Send email |
| `email_save_draft` | Save draft |
| `email_archive_thread` | Archive thread |
| `email_mark_read` | Mark as read |
| `email_mark_unread` | Mark as unread |
| `email_sync_account` | Sync account |
