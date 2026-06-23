# Agents Module

Optional agents mode that depends on the Pi CLI. Provides "plan" (read-only analysis) and "build" (take action on machine) modes with streaming event output.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/agents/agent-types.ts` | Type definitions |
| `src/modules/agents/agent-store.ts` | Zustand store with session management |
| `src/modules/agents/pi-runtime.ts` | Tauri IPC for Pi CLI |
| `src/modules/agents/components/agents-panel.tsx` | Main agents panel UI |
| `src/modules/agents/components/agent-output-view.tsx` | Live streaming output |
| `src/modules/agents/components/agent-session-list.tsx` | Session sidebar |
| `src/modules/agents/components/typewriter-markdown.tsx` | Typewriter markdown rendering |

## Requirements

- **Pi CLI** must be installed and available on PATH
- The module fails gracefully when Pi CLI is unavailable

## Agent Modes

| Mode | Description |
|------|-------------|
| `plan` | Read-only analysis — examines the codebase and provides recommendations |
| `build` | Action mode — can modify files and execute commands on the machine |

## Session Lifecycle

### 1. Runtime Check
`checkPiAvailable()` verifies Pi CLI is installed on PATH.

### 2. Session Start
1. User selects Plan or Build mode
2. User sets a workspace path (with folder browser)
3. User enters a prompt
4. `startSession()` creates a session and invokes `run_pi_agent` via Tauri

### 3. Event Streaming
Events are streamed from Pi CLI via Tauri events:
- `agent://run-finished` — Run completed
- `agent://run-event` — Live event during execution

### 4. Event Types

| Event | Description |
|-------|-------------|
| `status` | Session status change |
| `reasoning` | AI reasoning/thinking |
| `tool` | Tool execution |
| `output` | Text output |
| `error` | Error occurred |
| `result` | Final result |
| `token_update` | Token usage update |

### 5. Live Output Merging
- Reasoning deltas are merged incrementally
- Tool events are merged by `toolCallId` to avoid duplicates
- Output streaming displays text as it arrives
- ANSI escape codes are stripped from output

### 6. Session End
- Session status transitions to `completed` or `failed`
- Exit code is recorded
- Events are persisted in the session

## Session Management

### Persistence
- Sessions are persisted to localStorage (excluding running sessions)
- Running sessions are not persisted (they can't survive app restart)

### Concurrency
- Max **1 running session per project path**
- `chainedStart` prevents concurrent starts for the same workspace
- Starting a new session in the same project stops the previous one

### Operations
| Operation | Description |
|-----------|-------------|
| Start | Create and run a new session |
| Stop | Abort a running session |
| Delete | Remove a session |
| Clear | Clear all sessions |

## UI Components

### Agents Panel
- Mode selector (Plan/Build)
- Workspace path input with folder browser
- Runtime status pill (available/unavailable)
- Session list sidebar
- Output view with live streaming

### Output View
- Typewriter-style markdown rendering
- Expandable reasoning blocks
- Tool call indicators
- Error display

## Key Types

```typescript
type AgentMode = 'plan' | 'build'

type AgentStatus = 
  | 'idle' | 'checking_runtime' | 'ready' | 'running'
  | 'completed' | 'failed' | 'stopped'

interface AgentSession {
  id: string
  runtime: string
  mode: AgentMode
  status: AgentStatus
  projectPath: string
  prompt: string
  model?: string
  events: AgentEvent[]
  exitCode?: number
  contextTokens?: number
}

interface AgentEvent {
  type: 'status' | 'reasoning' | 'tool' | 'output' | 'error' | 'result' | 'token_update'
  data: any
  timestamp: number
}
```

## Tauri IPC Commands

| Command | Description |
|---------|-------------|
| `check_pi_available` | Check if Pi CLI is on PATH |
| `list_pi_sessions` | List Pi sessions |
| `switch_pi_session` | Switch active session |
| `delete_pi_session` | Delete a session |
| `stop_pi_agent` | Stop a running agent |
| `run_pi_agent` | Start an agent run (streams events) |

## Timeout

Agent runs have a **2-hour timeout**. If the agent doesn't complete within this time, it's automatically stopped.

---

# Architecture

Cross-cutting architecture patterns, state management, AI scheduling, and system design.

## Key Files

| File | Purpose |
|------|---------|
| `src/stores/chat-store.ts` | Central conversation state |
| `src/stores/settings-store.ts` | Combined settings (10 slices) |
| `src/stores/provider-store.ts` | Provider and model management |
| `src/stores/connectivity-store.ts` | Connectivity state |
| `src/lib/context.ts` | Context window management |
| `src/lib/prompts.ts` | Prompt construction |
| `src/lib/providers/` | Provider adapter interface |
| `src/lib/tool-registry.ts` | Tool definitions for LLM |
| `src/lib/ai-scheduler.ts` | AI job scheduler |
| `src/lib/conversation-storage.ts` | Encrypted conversation persistence |
| `src-tauri/src/lib.rs` | Tauri application setup |

## State Management

### Zustand Stores
Each feature has its own Zustand store:

| Store | Purpose |
|-------|---------|
| `chat-store` | Conversations, streaming buffer, messages |
| `settings-store` | All app settings (10 slices) |
| `provider-store` | LM Studio connection, model listing |
| `connectivity-store` | Online/offline/local-only state |
| `memory-store` | Memory nodes and retrieval |
| `document-store` | Documents with auto-save |
| `character-store` | Characters and groups |
| `project-store` | Projects |
| `research-store` | Research runs and reports |
| `email-store` | Email accounts and threads |
| `agent-store` | Agent sessions |

### Settings Store (10 Slices)
The settings store is composed from 10 slices:

1. **UI** — Layout, theme, panel sizes
2. **Model** — Default model, temperature, context length
3. **Memory** — Memory mode, scope limits
4. **Web Search** — SearXNG URL, provider settings
5. **Document** — Auto-save delay, default type
6. **Character** — Lorebook settings, chat defaults
7. **Research** — Default depth, approval requirements
8. **Code Execution** — Python path, timeout
9. **Connectivity** — Online/offline detection
10. **Chat** — Streaming, context management

All settings persist to localStorage under `veyra.settings.v1`.

## AI Job Scheduler

Central scheduler (`src/lib/ai-scheduler.ts`) manages all AI tasks.

### Job Types

| Type | Priority | Description |
|------|----------|-------------|
| `user_chat` | 0 (highest) | User chat requests |
| `agent_pi` | 1 | Pi CLI agent runs |
| `auto_name_chat` | 2 | Auto-generate conversation titles |
| `summarize_chat` | 3 | Conversation summarization |
| `extract_memory` | 3 | Memory extraction from chat |
| `compress_context` | 3 | Context compression |
| `maintenance` | 4 (lowest) | Background cleanup |
| `research_run` | 1 | Research pipeline execution |
| `character_ai_assist` | 2 | AI-assisted character creation |

### Priority Levels
- **0**: User-facing (highest priority)
- **1**: Important background tasks
- **2**: Standard background tasks
- **3**: Low-priority background tasks
- **4**: Maintenance (lowest)

### Behavior
- Jobs are queued and executed in priority order
- User chat always takes priority
- Background jobs run when the scheduler is idle
- Abort support for cancellable jobs

## Prompt Construction

The system prompt is assembled from ~10 XML-tagged blocks:

```
<veyra_core>        — Base AI identity and behavior
<veyra_project>     — Active project context
<veyra_character>   — Character persona
<veyra_context>     — Date, time, platform
<veyra_documents>   — Document tool instructions
<veyra_memory>      — Retrieved memory nodes
<veyra_conversation_summary>  — Summary of older turns
<veyra_tools>       — Available tool definitions
```

Each block is conditionally included based on the current state.

## Context Window Management

### Token Estimation
Uses a **4-chars-per-token heuristic** — simple but effective for trimming decisions.

### Message Trimming
Messages are trimmed to fit within the token budget:
```
token_budget = context_limit - reserved_output_tokens
```

Messages are removed oldest-first until the budget is satisfied.

### Context Stats
The UI displays:
- Estimated tokens used
- Percentage of context window used
- Number of included/dropped messages

## Provider System

### Adapter Interface
```typescript
interface ProviderAdapter {
  isAvailable(): Promise<boolean>
  fetchModels(): Promise<Model[]>
  sendChat(request: ChatRequest): Promise<ChatResponse>
  prepareModel(modelId: string): Promise<void>
  unloadAllModels(): Promise<void>
  reconnect(): Promise<void>
  startServer(): Promise<void>
}
```

### LM Studio Adapter
Currently the only registered provider. Handles:
- Model listing with 5-minute cache
- Streaming responses
- Model loading/unloading
- Server start/restart

## Tool System

### Registered Tools

| Tool | Description |
|------|-------------|
| `web_search` | Search the web via SearXNG |
| `code_execution` | Run Python code |
| `doc_create` | Create a document |
| `doc_read` | Read a document |
| `doc_update` | Update a document |

Each tool has a JSON schema defining its parameters. The LLM can call any tool, and calls are executed in rounds (up to 6) with re-prompting.

## Encrypted Storage

### Conversation Encryption
- AES-GCM encryption for conversation files
- Encryption keys managed by the Rust backend
- Web Workers handle encryption/decryption without blocking the UI
- Debounced saves (500ms) to avoid excessive I/O

### Key Management
- Keys are stored securely via Tauri
- Legacy key migration on startup
- Key rotation support

## Backend (Tauri)

### Rust Modules

| Module | Purpose |
|--------|---------|
| `agents/` | Pi CLI integration |
| `characters/` | Character and group CRUD |
| `code_execution/` | Python sandbox |
| `connectivity/` | Network checks |
| `documents/` | Document CRUD |
| `email/` | Gmail OAuth, IMAP |
| `file_extraction/` | PDF, DOCX extraction |
| `memory/` | Memory CRUD, BM25 + vector search |
| `projects/` | Project CRUD |
| `research/` | Research entity CRUD |
| `web_search/` | SearXNG Docker management |
| `shared/` | SQLite connection, migrations |

### Storage
- SQLite database for structured data
- JSON files for conversations (encrypted)
- localStorage for settings and agent sessions

## App Lifecycle

### Startup (`src/lib/startup.ts`)
1. Initialize Tauri IPC
2. Load settings from localStorage
3. Connect to LM Studio
4. Load characters, projects, documents
5. Check Pi CLI availability
6. Initialize web search (check Docker/SearXNG)

### Shutdown (`src/lib/app-shutdown.ts`)
1. Unload all AI models
2. Interrupt running research
3. Flush pending saves
4. Close SQLite connections

---

# Characters Module

Roleplay persona system with Character Card V3 support, lorebook matching, group chat, and AI-assisted creation.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/characters/character-types.ts` | Type definitions |
| `src/modules/characters/character-store.ts` | Zustand store for characters |
| `src/modules/characters/character-storage.ts` | Tauri IPC layer |
| `src/modules/characters/character-chat.ts` | Character chat helpers |
| `src/modules/characters/character-context.ts` | Builds character context block |
| `src/modules/characters/lorebook.ts` | Lorebook evaluation engine |
| `src/modules/characters/character-export.ts` | Export (Veyra JSON, CCv3 JSON, CCv3 PNG) |
| `src/modules/characters/character-group-types.ts` | Group chat types |
| `src/modules/characters/character-group-store.ts` | Group Zustand store |
| `src/modules/characters/group-chat.ts` | Group chat helpers |
| `src/modules/characters/ai-assist/` | AI-assisted creation and CCv3 I/O |

## Character Fields

A character record contains:

| Field | Description |
|-------|-------------|
| `name` | Character name (displayed in chat) |
| `title` | Short subtitle |
| `description` | Character description |
| `personality` | Personality traits |
| `scenario` | Setting/scenario context |
| `firstMessage` | Opening greeting |
| `alternateGreetings` | Multiple greeting options |
| `systemPrompt` | Custom system prompt override |
| `postHistoryInstructions` | Instructions after chat history |
| `exampleMessages` | Few-shot example messages |
| `lorebookEntries` | Contextual knowledge entries |
| `chatDefaults` | Per-character chat settings |

## Lorebook System

Lorebook entries provide contextual knowledge that's injected into the chat when triggered.

### Entry Fields
| Field | Description |
|-------|-------------|
| `keys` | Trigger keywords |
| `matchType` | `any` (OR), `all` (AND), or `regex` |
| `content` | Knowledge content to inject |
| `priority` | 1-5 (higher = more important) |
| `constant` | Always included (ignores keyword matching) |
| `selective` | Only included when keywords match |
| `insertionOrder` | Ordering within the lorebook block |
| `probability` | Roll chance (0-100%) for non-constant entries |
| `position` | `before` or `after` the character block |

### How Lorebook Works
1. The engine scans trailing messages for keyword matches
2. Matches are filtered by probability rolls
3. Entries are sorted by priority, then insertion order
4. Results are capped at `maxLorebookEntries` (default from chat defaults)
5. Matched entries are injected into `<veyra_lorebook>` block

### Scan Depth
Controls how many recent messages are scanned for keyword matches (configurable per character).

## Character Context Injection

When a character is active, the system prompt includes these blocks:

1. **`<veyra_character>`** — Persona block (name, description, personality, scenario)
2. **`<veyra_character_system>`** — System prompt override (if provided)
3. **`<veyra_character_examples>`** — Few-shot examples (if enabled)
4. **`<veyra_lorebook>`** — Matched lorebook entries
5. **Post-history instructions** — Instructions after chat history

Total character context is soft-capped at **16,000 characters** with truncation.

## Starting a Character Chat

1. `startCharacterChat()` creates a new conversation bound to the character
2. The greeting is randomly picked from `firstMessage` + `alternateGreetings`
3. The conversation is pre-seeded with the greeting as the first assistant message
4. Character identity snapshots are preserved in conversations even if the character is later deleted or renamed

## Group Chat

Multiple characters can share a conversation.

### Group Fields
| Field | Description |
|-------|-------------|
| `name` | Group display name |
| `memberIds` | Array of character IDs |
| `speakerMode` | `manual` (user picks) or `auto` (AI selects) |
| `openingMessage` | Group greeting |
| `activeSpeakerId` | Currently active character |

### Group Chat Flow
1. `startGroupChat()` creates a conversation with the group binding
2. The `activeSpeaker` character responds to each turn
3. Manual mode: user selects which character speaks
4. Auto mode: AI selects the most appropriate speaker
5. `regenerateGroupGreeting()` swaps the opening message

## Character Chat Defaults

Per-character settings that override global settings:

| Setting | Description |
|---------|-------------|
| `scanDepth` | How many messages to scan for lorebook matches |
| `maxLorebookEntries` | Maximum lorebook entries to inject |
| `includeExamples` | Whether to include few-shot examples |
| `allowDocumentTools` | Whether doc tools are available in character chat |

## Import/Export

### Export Formats
| Format | Description |
|--------|-------------|
| Veyra JSON | Native Veyra format |
| Character Card V3 JSON | Standard CCv3 format (SillyTavern compatible) |
| Character Card V3 PNG | PNG with embedded CCv3 metadata chunk |

### Import
- Import from Veyra JSON or Character Card V3 JSON
- AI-assisted creation: describe a character and the AI generates the full record

---

# Chat Module

The chat module is Veyra's core AI pipeline. It manages conversations, streaming responses, tool calls, memory injection, and context window management.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/chat/chat-orchestrator.ts` | Main orchestrator — builds prompts, runs provider, handles tool loops |
| `src/modules/chat/chat-actions.ts` | Entry point: `executeChatSend()` |
| `src/modules/chat/chat-types.ts` | All type definitions |
| `src/modules/chat/chat-summarize.ts` | Rolling conversation summarization |
| `src/modules/chat/chat-tool-rounds.ts` | Tool call execution engine |
| `src/modules/chat/chat-tool-utils.ts` | Tool utility functions |
| `src/modules/chat/tools/` | Individual tool implementations |
| `src/modules/chat/components/` | UI components |

## Chat Modes

Veyra supports 4 chat modes:

| Mode | Description |
|------|-------------|
| `chat` | Standard AI conversation |
| `agents` | Pi CLI agent integration |
| `research` | Deep research pipeline |
| `characters` | Character roleplay chat |

## How It Works

### 1. Message Send
User types a message in the composer component and hits send.

### 2. Pipeline Entry (`executeChatSend`)
- Loads the orchestrator lazily
- Handles explicit memory saves if requested
- Prepares the model via LM Studio adapter

### 3. Orchestrator (`sendChatRequest`)
- **Memory pack**: Builds memory context from relevant stored memories
- **System prompt composition**: Assembles ~10 XML-tagged blocks:
  - `<veyra_core>` — Base AI identity
  - `<veyra_project>` — Active project context
  - `<veyra_character>` — Character persona (if in character mode)
  - `<veyra_context>` — Date, time, platform info
  - `<veyra_documents>` — Document tool instructions
  - `<veyra_memory>` — Retrieved memory nodes
  - `<veyra_conversation_summary>` — Summary of older turns
  - `<veyra_tools>` — Available tool definitions
- **Message trimming**: Fits messages within the token budget (context limit minus reserved output)
- **Streaming**: Provider adapter streams tokens with callbacks for content, reasoning, and tool calls

### 4. Tool Calls (up to 6 rounds)
If the model returns tool calls, they are executed in rounds:

| Tool | Description |
|------|-------------|
| `web_search` | Search the web via SearXNG |
| `code_execution` | Run Python code via Tauri |
| `doc_read` | Read a document |
| `doc_create` | Create a new document |
| `doc_update` | Update an existing document |

After each round, results are fed back to the model for re-prompting.

### 5. Post-Chat Jobs
After the response completes:
- **Memory handoff**: Explicit memory saves
- **Auto-summarization**: If context usage > 55%, older turns are folded into a summary
- **Memory extraction**: LLM extracts memory candidates from the conversation

## Context Window Management

- Token estimation uses a **4-chars-per-token heuristic** (`src/lib/context.ts`)
- Messages are trimmed to fit within the token budget
- Summary preserves the last 8 messages verbatim
- Context stats show estimated tokens, percent used, and included/dropped message counts

## Streaming

The UI supports real-time streaming of:
- **Content tokens** — The AI's response text
- **Reasoning tokens** — Chain-of-thought (shown in expandable block)
- **Web search state** — Search/fetch/reading progress
- **Tool calls** — Live tool execution indicators

## Conversation Storage

- Conversations are encrypted with **AES-GCM** using keys from the Rust backend
- Saves are debounced (500ms) to avoid excessive writes
- Stored in `%APPDATA%/com.veyra.app/` as JSON files

## Key Types

```typescript
type ChatMode = 'chat' | 'agents' | 'research' | 'characters'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  reasoning?: string
  toolCalls?: ToolCallState[]
  webSearchRound?: WebSearchRound
  timestamp: number
}

interface Conversation {
  id: string
  title: string
  mode: ChatMode
  messages: ChatMessage[]
  characterId?: string
  projectId?: string
  summary?: string
  createdAt: number
  updatedAt: number
}
```

---

# Documents Module

Markdown document editor with versioning, AI-assisted creation/update, and export. Documents can be scoped to conversations, projects, or be global.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/documents/document-types.ts` | Type definitions |
| `src/modules/documents/document-store.ts` | Zustand store with auto-save and versioning |
| `src/modules/documents/document-runtime.ts` | AI document operations |
| `src/modules/documents/document-markdown.ts` | Markdown section manipulation |
| `src/modules/documents/document-export.ts` | Export to markdown/txt |

## Document Types

| Type | Description |
|------|-------------|
| `document` | General document |
| `technical_spec` | Technical specification |
| `essay` | Essay or article |
| `report` | Report with structure |
| `proposal` | Project proposal |
| `readme` | Readme file |
| `notes` | Quick notes |
| `prompt` | AI prompt template |
| `project_plan` | Project planning doc |
| `meeting_notes` | Meeting notes |
| `research_brief` | Research summary |
| `agent_instruction` | Agent instruction set |

## Document Statuses

| Status | Description |
|--------|-------------|
| `draft` | Work in progress |
| `review` | Under review |
| `final` | Completed |
| `archived` | No longer active |

## How It Works

### Storage
Documents are stored in SQLite via Tauri IPC. Each document has:
- `id`, `title`, `content`, `type`, `status`
- `conversationId` or `projectId` for scoping
- `versionCount` for version history
- `createdAt`, `updatedAt` timestamps

### Active Document Draft
- The active document maintains an in-memory draft to avoid remapping on every keystroke
- Draft content is separate from the persisted version

### Auto-Save
- Debounced save (configurable delay) avoids excessive writes
- Each save creates a version snapshot
- Version snapshots track change source: `user`, `assistant`, or `system`

### AI Integration
Documents are accessible via 3 chat tools:

#### `doc_read`
```json
{
  "documentId": "string",
  "includeVersions": false
}
```

#### `doc_create`
```json
{
  "title": "string",
  "content": "string",
  "type": "document",
  "conversationId": "optional",
  "projectId": "optional"
}
```

#### `doc_update`
```json
{
  "documentId": "string",
  "updateMode": "replace_all | replace_section | insert_after_section | replace_text",
  "targetSection": "optional heading text",
  "newContent": "string"
}
```

### Update Modes
| Mode | Description |
|------|-------------|
| `replace_all` | Replace entire document content |
| `replace_section` | Replace a section by heading |
| `insert_after_section` | Insert content after a section |
| `replace_text` | Replace specific text |

### Version History
- Pre/post version snapshots are created for each AI mutation
- Enables undo capability for AI edits
- Version count is tracked on the document record

### Export
- Export to **Markdown** (.md) or **Plain Text** (.txt)
- Uses Tauri save dialog for file location selection

### Auto-Sync
- Documents sync with the active conversation context
- Documents sync with the active project context
- When switching conversations/projects, the document list updates accordingly

## Key Types

```typescript
interface DocumentRecord {
  id: string
  title: string
  content: string
  type: DocumentType
  status: DocumentStatus
  conversationId?: string
  projectId?: string
  versionCount: number
  createdAt: number
  updatedAt: number
}

interface DocumentVersion {
  id: string
  documentId: string
  content: string
  changeSource: 'user' | 'assistant' | 'system'
  createdAt: number
}
```

---

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

---

# Memory Module

Local-first memory system with 5 modes and 10 node types. Provides persistent knowledge that survives across conversations.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/memory/memory-types.ts` | Type definitions |
| `src/modules/memory/memory-store.ts` | Zustand store for CRUD |
| `src/modules/memory/memory-extraction.ts` | LLM-based memory extraction from chat |
| `src/modules/memory/memory-retrieval.ts` | Relevance-based memory retrieval |
| `src/modules/memory/memory-router.ts` | Decides when to run retrieval |
| `src/modules/memory/memory-retention.ts` | Automatic cleanup and eviction |
| `src/modules/memory/memory-storage.ts` | Tauri IPC layer |
| `src/modules/memory/profile-config.ts` | User profile setup (7 categories, 21 questions) |
| `src/modules/memory/profile-helpers.ts` | Profile memory identification |

## Memory Modes

| Mode | Behavior |
|------|----------|
| `off` | No extraction or retrieval |
| `manual_only` | Only explicit "remember this" saves |
| `safe_auto_save` | Auto-save high-confidence extractions |
| `review_all` | Extract everything, require manual approval |
| `aggressive_project_memory` | Maximum extraction with project scoping |

## Memory Node Types

| Type | Description |
|------|-------------|
| `preference` | User preferences and habits |
| `project` | Project-level information |
| `project_fact` | Factual project details |
| `decision` | Decisions made during conversation |
| `instruction` | User instructions for the AI |
| `summary` | Conversation summaries |
| `task` | Tasks and to-dos |
| `idea` | Ideas and brainstorming |
| `file_reference` | References to files |
| `temporary_context` | Short-lived contextual info |

## Memory Priorities

| Priority | Description |
|----------|-------------|
| `permanent` | Never auto-archived |
| `high` | Rarely evicted |
| `medium` | Standard retention |
| `low` | Evicted when over capacity |
| `ephemeral` | 7-day TTL, first to be evicted |

## Scopes

| Scope | Description |
|-------|-------------|
| `global` | Available across all conversations |
| `project` | Scoped to a specific project |
| `conversation` | Scoped to a single conversation |
| `session` | Ephemeral, current session only |

## How It Works

### Extraction (Post-Chat)
1. After chat turns, `shouldExtractMemoryBatch()` checks if enough new messages exist (min 4 messages, 2 exchanges)
2. `runMemoryExtractionBatch()` sends the transcript to the LLM
3. LLM outputs JSON with memory candidates
4. Deduplication: text similarity + optional vector similarity against existing memories
5. High-confidence items are auto-saved; others require review
6. Batch size capped at 16 messages; 90-second pending threshold

### Retrieval (Pre-Chat)
1. `memory-router.ts` detects if memory retrieval is needed (looks for cues like "remember", "my name", etc.)
2. Skips greetings, trivial math, and very short messages
3. `buildMemoryPackWithInfo()` searches for candidates:
   - **Durable seeds**: High-priority pinned/permanent memories
   - **Vector search**: Optional semantic similarity (requires external endpoint)
   - **Keyword search**: BM25-style keyword matching
4. Multi-factor scoring:
   - Keyword match score
   - Importance and confidence ratings
   - Pinned boost
   - Recency and use-count boosts
   - Project and category alignment
   - Profile-aware boosting
5. Noise floor filtering removes low-relevance candidates
6. Binary search trims results to fit within the token budget

### Retention (Periodic)
- Archives expired ephemeral nodes (7-day TTL)
- Evicts low-priority overflow:
  - 200 global nodes max
  - 100 nodes per project
  - 30 nodes per conversation

### Protected Memories
The following are never auto-archived:
- Pinned memories
- Permanent priority
- Importance >= 5
- Explicit user saves
- Manual edits
- Profile setup nodes

## Profile Setup

User profile with 7 categories and 21 questions:
- **Identity**: Name, pronouns, location
- **Communication**: Preferred tone, formality level
- **Expertise**: Technical skills, domains
- **Interests**: Hobbies, topics of interest
- **Work**: Job role, projects
- **Learning**: Current learning goals
- **Preferences**: UI, AI behavior preferences

Profile responses become structured memory nodes that boost retrieval for relevant queries.

---

# Veyra - Overview

Veyra is a **local-first AI desktop workspace** built with Tauri v2, React, TypeScript, Vite, and Zustand. It runs AI models locally via LM Studio and keeps all data on your machine.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 (Rust backend) |
| Frontend | React 19, TypeScript, Vite 8 |
| Styling | Tailwind CSS 4 |
| State | Zustand 5 |
| AI provider | LM Studio (local) |
| Persistence | SQLite (via Tauri), encrypted JSON (conversations), localStorage (settings) |

## Storage Paths

All runtime data is local-only and never leaves your machine:

| Data | Location |
|------|----------|
| Conversations | `%APPDATA%/com.veyra.app/` (AES-GCM encrypted) |
| Memory DB | `%APPDATA%/com.veyra.app/` (SQLite) |
| Settings | Browser localStorage (`veyra.settings.v1`) |
| Characters | SQLite via Tauri |
| Documents | SQLite via Tauri |
| Projects | SQLite via Tauri |
| Research | SQLite via Tauri |
| Email accounts | SQLite via Tauri |

## Feature Modules

| Module | Description |
|--------|-------------|
| [Chat](./01-chat.md) | Core AI chat pipeline with streaming, tool calls, and memory injection |
| [Memory](./02-memory.md) | Local-first memory system with 5 modes and 10 node types |
| [Documents](./03-documents.md) | Markdown document editor with versioning and AI assistance |
| [Characters](./04-characters.md) | Roleplay personas with lorebook, group chat, and CCv3 support |
| [Research](./05-research.md) | 9-phase deep research pipeline with citation auditing |
| [Web Search](./06-web-search.md) | SearXNG/Docker search with ArXiv and Wikipedia support |
| [Projects](./07-projects.md) | Per-project containers for scoping chats, memory, and settings |
| [Email](./08-email.md) | Gmail OAuth and IMAP email client |
| [Agents](./09-agents.md) | Optional Pi CLI integration for plan and build modes |
| [Architecture](./10-architecture.md) | Cross-cutting architecture patterns and system design |

## Running the App

```powershell
# Frontend only (browser preview)
npm run dev

# Desktop app (Tauri + hot reload)
npm run dev:app

# Full stack (Tauri production build)
npm run dev:full

# Production build
npm run build

# Lint and typecheck
npm run lint

# Tests
npm run test
```

## Dependencies

### Core
- `@tauri-apps/api` v2 - Tauri IPC
- `react` / `react-dom` v19 - UI framework
- `zustand` v5 - State management
- `react-markdown` + `remark-gfm` + `rehype-highlight` - Markdown rendering
- `lucide-react` - Icons
- `clsx` + `tailwind-merge` - Class utilities

### Backend (Tauri plugins)
- `@tauri-apps/plugin-dialog` - File dialogs
- `@tauri-apps/plugin-http` - HTTP requests
- `@tauri-apps/plugin-shell` - Shell commands (Pi CLI, Docker)

### Dev
- Vite 8, TypeScript 6, ESLint 10, Vitest 3, Tailwind CSS 4

---

# Projects Module

Persistent local containers that scope chats, documents, memories, tools, and settings around a goal or workstream.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/projects/project-types.ts` | Type definitions |
| `src/modules/projects/project-store.ts` | Zustand store |

## Project Kinds

| Kind | Description |
|------|-------------|
| `app` | Application development |
| `client` | Client work |
| `codebase` | Codebase management |
| `creative` | Creative projects |
| `research` | Research work |
| `general` | General purpose |
| `class` | Educational/coursework |

## Project Statuses

| Status | Description |
|--------|-------------|
| `active` | Currently in use |
| `paused` | On hold |
| `archived` | No longer active |

## Project Fields

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `name` | Display name |
| `description` | Short description |
| `kind` | Project category |
| `color` | UI accent color |
| `icon` | Display icon |
| `systemPrompt` | Custom system prompt injected into chat |
| `settings` | Per-project overrides |

## Per-Project Settings

| Setting | Description |
|---------|-------------|
| `memoryEnabled` | Enable/disable memory for this project |
| `memoryMode` | Override memory mode |
| `webSearchEnabled` | Enable/disable web search |
| `webSearchMode` | Override web search mode |
| `enabledTools` | Which tools are available |
| `modelId` | Project-specific model selection |
| `temperature` | Model temperature override |
| `contextLength` | Context window override |
| `maxTokens` | Max output tokens override |
| `agentProjectPath` | Workspace path for agents mode |

## How It Works

### Project Activation
1. User selects a project from the project list
2. The project becomes the "active project"
3. Its system prompt is injected into every chat turn as `<veyra_project>`
4. Project-specific settings override global settings

### Context Injection
When a project is active, the system prompt includes:
```xml
<veyra_project>
  <name>Project Name</name>
  <description>Project description</description>
  <kind>Project kind</kind>
  <instructions>Custom system prompt from the project</instructions>
</veyra_project>
```

### Scoped Resources
The following resources can be scoped to a project:
- **Conversations**: Chat threads belong to a project
- **Documents**: Documents can be project-specific
- **Memory**: Memory nodes can be project-scoped

### Project Tracking
- `lastOpenedAt` timestamp is updated when a project is opened
- Projects are sorted by recency by default
- Active/archived filtering in the store

## Key Types

```typescript
interface ProjectRecord {
  id: string
  name: string
  description: string
  kind: ProjectKind
  status: ProjectStatus
  color: string
  icon: string
  systemPrompt: string
  settings: ProjectSettings
  lastOpenedAt: number
  createdAt: number
  updatedAt: number
}

interface ProjectSettings {
  memoryEnabled: boolean
  memoryMode: MemoryMode
  webSearchEnabled: boolean
  webSearchMode: WebSearchMode
  enabledTools: string[]
  modelId?: string
  temperature?: number
  contextLength?: number
  maxTokens?: number
  agentProjectPath?: string
}
```

---

# Research Module

Deep research pipeline with 9 phases. Supports multiple depth presets, plan approval, source scoring, contradiction detection, and citation auditing.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/research/research-types.ts` | Comprehensive type system |
| `src/modules/research/research-store.ts` | Zustand store with full CRUD |
| `src/modules/research/research-runtime.ts` | Research execution engine |
| `src/modules/research/research-lifecycle.ts` | Interrupted run handling |
| `src/modules/research/research-plan-phase.ts` | Plan generation |
| `src/modules/research/research-search-phase.ts` | Search execution |
| `src/modules/research/research-read-phase.ts` | Source reading |
| `src/modules/research/research-extract-phase.ts` | Evidence extraction |
| `src/modules/research/research-verify-phase.ts` | Claim verification |
| `src/modules/research/research-gap-phase.ts` | Gap analysis |
| `src/modules/research/research-synthesis-phase.ts` | Report synthesis |
| `src/modules/research/research-ai.ts` | LLM interaction utilities |
| `src/modules/research/research-claim-similarity.ts` | Claim deduplication |
| `src/modules/research/source-credibility.ts` | Source quality scoring |
| `src/modules/research/research-depth-config.ts` | Per-depth configuration |

## Research Depth Presets

| Preset | Description |
|--------|-------------|
| `lightning` | Quick overview, minimal sources |
| `quick` | Fast research with moderate depth |
| `standard` | Balanced research depth |
| `deep` | Thorough multi-source research |
| `exhaustive` | Maximum depth, all available sources |

Each preset configures: query limits, fetch limits, max sources, validation depth, and extraction thoroughness.

## The 9-Phase Pipeline

### Phase 1: Plan
- LLM generates a structured research plan
- Plan includes: steps, search queries per step, expected source types
- **Plan approval flow**: users can review and edit the plan before execution

### Phase 2: Search
- Executes searches using the web search orchestrator
- Multi-query planning: each step generates multiple search queries
- Concurrent execution with query concurrency limits

### Phase 3: Read
- Fetches and reads source content
- Content extraction via Tauri backend (PDF, HTML, etc.)
- Deduplication of identical sources

### Phase 4: Validate
- Scores source quality across 4 dimensions:
  - **Relevance**: How closely the source relates to the query
  - **Credibility**: Source authority and trustworthiness
  - **Currency**: How recent the information is
  - **Depth**: Level of detail provided
- Sources below quality thresholds are filtered out

### Phase 5: Extract
- Extracts evidence from validated sources
- Evidence types: claims, statistics, quotes, facts, methodologies
- Each evidence item is linked to its source

### Phase 6: Verify
- Cross-references claims across multiple sources
- **Contradiction detection**: Uses trigram-Jaccard similarity + LLM dedup
- Claims supported by multiple sources are marked as verified

### Phase 7: Gap Analysis
- Identifies missing information
- Generates follow-up queries to fill gaps
- If gaps are significant, the pipeline may loop back to search

### Phase 8: Synthesize
- Generates a cited report
- Citation maps link claims to sources
- Report structure follows academic conventions

### Phase 9: Finalize
- Saves the report
- Optional export to Documents module
- Optional export to Memory module as knowledge nodes

## Source Types

| Type | Description |
|------|-------------|
| `webpage` | General web page |
| `pdf` | PDF document |
| `news` | News article |
| `arxiv` | ArXiv paper |
| `wikipedia` | Wikipedia article |
| `government` | Government source |
| `academic` | Academic paper |
| `forum` | Forum discussion |
| `documentation` | Technical docs |
| `blog` | Blog post |
| `social` | Social media |
| `data` | Dataset or data source |
| `book` | Book excerpt |
| `patent` | Patent filing |
| `other` | Unclassified |

## Key Types

```typescript
interface ResearchRun {
  id: string
  query: string
  depth: ResearchDepth
  status: ResearchRunStatus
  planId?: string
  reportId?: string
  startedAt: number
  completedAt?: number
}

type ResearchRunStatus = 
  | 'planning' | 'searching' | 'reading' | 'extracting'
  | 'verifying' | 'synthesizing' | 'completed' | 'failed' | 'paused'

interface ResearchSource {
  id: string
  url: string
  title: string
  type: SourceType
  credibilityScore: number
  fetchedAt: number
}

interface ResearchEvidence {
  id: string
  sourceId: string
  claim: string
  type: EvidenceType
  confidence: number
}

interface ResearchClaim {
  id: string
  text: string
  supportingEvidence: string[]
  contradictingEvidence: string[]
  verified: boolean
}
```

## Pause/Resume

- Research runs can be paused mid-execution
- AbortController handles graceful shutdown
- Paused runs are reconciled on app close/reopen
- Interrupted runs transition to `paused` status

## Report Export

Reports can be exported to:
- **Documents**: Creates a new document with the synthesized report
- **Memory**: Extracts key findings as memory nodes
- **File**: Direct markdown/text export (via document export)

---

# Web Search Module

Optional web search capability via SearXNG (Docker) with direct ArXiv and Wikipedia API support. Used by both the chat tool and the research pipeline.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/web-search/types.ts` | Type definitions |
| `src/modules/web-search/orchestrator/SearchOrchestrator.ts` | Main search orchestrator |
| `src/modules/web-search/search-planner.ts` | Multi-query generation |
| `src/modules/web-search/search-ranker.ts` | Result deduplication and ranking |
| `src/modules/web-search/searxng-setup.ts` | Docker setup for SearXNG |
| `src/modules/web-search/providers/` | Provider implementations |
| `src/modules/web-search/tauri-commands.ts` | Tauri IPC for page fetching |

## Providers

| Provider | Description |
|----------|-------------|
| SearXNG | Self-hosted search via Docker container |
| ArXiv | Direct ArXiv API for academic papers |
| Wikipedia | Direct Wikipedia API |

## SearXNG Setup

### Requirements
- Docker Desktop installed and running
- SearXNG Docker container

### Auto-Setup
1. `searxng-setup.ts` checks Docker installation and daemon status
2. If the SearXNG container exists, it's auto-started
3. If not, Docker pulls and creates the container
4. The SearXNG URL must be **localhost** (SSRF protection)

### Security
- SearXNG URL is validated to be localhost-only
- Prevents server-side request forgery (SSRF) attacks

## How Search Works

### 1. Query Planning (`search-planner.ts`)
Generates multiple search queries from a single user query across different lanes:

| Lane | Purpose | Example |
|------|---------|---------|
| General | Standard search | "quantum computing applications" |
| Recent | Current year filter | "quantum computing 2025 applications" |
| Academic | Scholarly sources | "quantum computing applications research paper" |
| Primary | Government/data sources | "quantum computing applications site:gov" |
| Opposing | Criticism/limitations | "quantum computing limitations problems" |

### 2. Concurrent Execution
- Queries are executed concurrently (max 3 at a time)
- Each query hits the SearXNG API
- Results are collected and merged

### 3. Deduplication and Ranking (`search-ranker.ts`)
- Results are deduplicated by URL
- Ranked by relevance to the original query
- Source diversity is encouraged

### 4. Page Fetching
- Top results are fetched via Tauri IPC
- Content is extracted from HTML
- Fetch status is tracked per result

### 5. Context Bundle
Returns a `SearchContextBundle` containing:
- `sources` — Array of search results with metadata
- `summaries` — Page content summaries
- `diagnostics` — Timing and error info

## Chat Tool Integration

In chat, the `web_search` tool triggers search:
```json
{
  "query": "string",
  "numResults": 5
}
```

The tool has retry logic (up to 2 retries) and real-time UI updates showing:
- Search phase: querying sources
- Fetch phase: downloading content
- Reading phase: extracting text

## Research Pipeline Integration

The research module uses the search orchestrator with:
- Multiple queries per research step
- Source type filtering
- Higher fetch limits for thorough research

## Key Types

```typescript
type SearchProvider = 'searxng' | 'arxiv' | 'wikipedia'

interface SearchInput {
  query: string
  provider?: SearchProvider
  numResults?: number
  freshness?: string
}

interface SearchResult {
  url: string
  title: string
  snippet: string
  source: SearchProvider
  publishedDate?: string
}

interface SearchContextBundle {
  sources: SearchResult[]
  summaries: FetchedPageSummary[]
  diagnostics: SearchDiagnostics
}
```