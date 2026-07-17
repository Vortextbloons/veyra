# Email Setup

Email client with Gmail OAuth and IMAP support.

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
