# Veyra — Complete Documentation
> Auto-generated from docs/INDEX.md by scripts/combine-docs.mjs
> Generated: 2026-10-25T07:27:49.637Z
> Total files: 59

## Table of Contents

- [overview](#overview)
  - [01-tech-stack](#overview-01-tech-stack)
  - [02-storage](#overview-02-storage)
  - [03-running-the-app](#overview-03-running-the-app)
  - [04-feature-modules](#overview-04-feature-modules)
  - [README](#overview-readme)
- [chat](#chat)
  - [01-pipeline](#chat-01-pipeline)
  - [02-tools](#chat-02-tools)
  - [03-context-window](#chat-03-context-window)
  - [04-streaming](#chat-04-streaming)
  - [05-storage](#chat-05-storage)
  - [06-types](#chat-06-types)
  - [README](#chat-readme)
- [hooks](#hooks)
  - [01-overview](#hooks-01-overview)
  - [README](#hooks-readme)
- [extensions](#extensions)
  - [01-mcp-servers](#extensions-01-mcp-servers)
  - [02-skills](#extensions-02-skills)
  - [03-chat-integration](#extensions-03-chat-integration)
  - [04-types](#extensions-04-types)
  - [README](#extensions-readme)
- [research](#research)
  - [01-pipeline](#research-01-pipeline)
  - [02-depth-presets](#research-02-depth-presets)
  - [03-source-types](#research-03-source-types)
  - [04-pause-resume](#research-04-pause-resume)
  - [05-report-export](#research-05-report-export)
  - [06-types](#research-06-types)
  - [README](#research-readme)
- [web-search](#web-search)
  - [01-setup](#web-search-01-setup)
  - [02-search-flow](#web-search-02-search-flow)
  - [03-providers](#web-search-03-providers)
  - [04-integration](#web-search-04-integration)
  - [05-types](#web-search-05-types)
  - [README](#web-search-readme)
- [projects](#projects)
  - [01-overview](#projects-01-overview)
  - [02-settings](#projects-02-settings)
  - [03-architecture](#projects-03-architecture)
  - [04-types](#projects-04-types)
  - [README](#projects-readme)
- [agents](#agents)
  - [01-overview](#agents-01-overview)
  - [02-session-management](#agents-02-session-management)
  - [03-events](#agents-03-events)
  - [04-ui](#agents-04-ui)
  - [05-tauri-commands](#agents-05-tauri-commands)
  - [06-types](#agents-06-types)
  - [07-reasoning](#agents-07-reasoning)
  - [README](#agents-readme)
- [connectivity](#connectivity)
  - [01-overview](#connectivity-01-overview)
  - [02-types](#connectivity-02-types)
  - [README](#connectivity-readme)
- [code-execution](#code-execution)
  - [01-overview](#code-execution-01-overview)
  - [README](#code-execution-readme)
- [architecture](#architecture)
  - [01-state-management](#architecture-01-state-management)
  - [02-ai-scheduler](#architecture-02-ai-scheduler)
  - [03-prompt-construction](#architecture-03-prompt-construction)
  - [04-provider-system](#architecture-04-provider-system)
  - [05-tool-system](#architecture-05-tool-system)
  - [06-encrypted-storage](#architecture-06-encrypted-storage)
  - [07-backend](#architecture-07-backend)
  - [08-context-window](#architecture-08-context-window)
  - [README](#architecture-readme)

---

# overview > 01-tech-stack

> Source: `docs/overview/01-tech-stack.md`

# Tech Stack

Veyra is a **local-first AI desktop workspace** built with Tauri v2, React, TypeScript, Vite, and Zustand. It runs AI models locally via LM Studio and keeps all data on your machine.

## Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 (Rust backend) |
| Frontend | React 19, TypeScript, Vite 8 |
| Styling | Tailwind CSS 4 |
| State | Zustand 5 |
| AI provider | LM Studio (local) |
| Persistence | SQLite (via Tauri), encrypted JSON (conversations), localStorage (settings) |

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
- `@tauri-apps/plugin-shell` - Shell commands (Pi CLI)

### Dev
- Vite 8, TypeScript 6, ESLint 10, Vitest 3, Tailwind CSS 4

---

# overview > 02-storage

> Source: `docs/overview/02-storage.md`

# Storage Paths

All runtime data is local-only and never leaves your machine. Timestamps are ISO 8601 strings in most structured records.

| Data | Location | Format |
|------|----------|--------|
| Conversations | `%APPDATA%/com.veyra.app/` | AES-GCM encrypted JSON with rotating backup |
| App database | `%APPDATA%/com.veyra.app/` | SQLite |
| Settings | localStorage | `veyra.settings.v1` key |
| Provider config | localStorage | `veyra.provider.v1` key |
| Projects | SQLite via Tauri | Structured records |
| Research | SQLite via Tauri | Structured records |
| Agent sessions | localStorage | Serialized sessions |
| Cloud credentials | OS credential vault | Tauri secure storage |

## Privacy

- No data leaves the machine unless the user explicitly enables web search or cloud providers
- Cloud API keys are stored in the operating-system credential vault through Tauri and are excluded from Zustand persistence
- Conversation keys are stored in the operating-system credential vault, not beside ciphertext
- Conversation writes are atomic and retain one previous encrypted snapshot for recovery
- Web Workers handle encryption/decryption without blocking the UI

---

# overview > 03-running-the-app

> Source: `docs/overview/03-running-the-app.md`

# Running the App

All commands use PowerShell. If PowerShell blocks `npm.ps1`, use `npm.cmd run <script>` instead.

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

# Combine docs
npm run docs:combine

# Verify version.json sync
npm run version:check
```

## Dev workflow

1. Run `npm run dev:app` for Tauri development with hot reload
2. `npm run build` for frontend-only changes
3. `npm run test` for behavior changes
4. `npm run lint` for broader TS/React edits
5. `npm run build:app` for Rust/Tauri changes when practical

---

# overview > 04-feature-modules

> Source: `docs/overview/04-feature-modules.md`

# Feature Modules

| Module | Folder | Description |
|--------|--------|-------------|
| Chat | `docs/chat/` | Core AI chat pipeline with streaming and tool calls |
| Research | `docs/research/` | 9-phase deep research pipeline with citation auditing |
| Web Search | `docs/web-search/` | Bundled DonSeTch search with ArXiv and Wikipedia support |
| Projects | `docs/projects/` | Per-project containers for scoping chats and settings |
| Agents | `docs/agents/` | Optional Pi CLI integration for plan and build modes |
| Architecture | `docs/architecture/` | Cross-cutting patterns, state management, providers, backend |

---

# overview > README

> Source: `docs/overview/README.md`

# Overview

Veyra is a **local-first AI desktop workspace** built with Tauri v2, React, TypeScript, Vite, and Zustand.

## Contents

- [01-tech-stack.md](01-tech-stack.md) — Tech stack and dependencies
- [02-storage.md](02-storage.md) — Data storage paths and privacy
- [03-running-the-app.md](03-running-the-app.md) — Commands and dev workflow
- [04-feature-modules.md](04-feature-modules.md) — Feature module listing

---

# chat > 01-pipeline

> Source: `docs/chat/01-pipeline.md`

# Chat Pipeline

The chat module is Veyra's core AI pipeline. It manages conversations, streaming responses, tool calls, and context window management.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/chat/chat-orchestrator.ts` | Main orchestrator — builds prompts, runs provider, handles tool loops |
| `src/modules/chat/chat-actions.ts` | Entry point: `executeChatSend()` |
| `src/modules/chat/chat-types.ts` | All type definitions |
| `src/modules/chat/chat-context-builder.ts` | System prompt assembly from XML blocks |
| `src/modules/chat/chat-provider-options.ts` | Provider selection logic |
| `src/modules/chat/tools/` | Individual tool implementations |
| `src/modules/chat/components/` | UI components |

## Chat Modes

| Mode | Description |
|------|-------------|
| `chat` | Standard AI conversation |
| `agents` | Pi CLI agent integration |
| `research` | Deep research pipeline |

## Pipeline Flow

### 1. Message Send
User types a message in the composer component and hits send.

### 2. Pipeline Entry (`executeChatSend`)
- Loads the orchestrator lazily
- Prepares the model via LM Studio adapter

### 3. Orchestrator (`sendChatRequest`)
- **System prompt composition**: Assembles context blocks from `BuildChatContextOptions`:
  - `<veyra_core>` — Base AI identity
  - `<model_identity>` — Model name/identity
  - `<veyra_user_prompt>` — Custom user instructions
  - `<veyra_project>` — Active project context
  - `<veyra_context>` — Date, time, platform info (context anchoring)
  - `<veyra_conversation_summary>` — Summary of older turns
  - `<veyra_tools>` — Available tool definitions
- **Message trimming**: Fits messages within the token budget (context limit minus reserved output)
- **Streaming**: Provider adapter streams tokens with callbacks for content, reasoning, and tool calls
- **Enhanced mode**: When enabled, adds `scratchpad_write` and `ask_question` tools, increases max tool rounds from 6 to 10

### 4. Stop / Cancel

During streaming, pressing **Escape** or calling `handleStopStreaming` (returned by `useChatPipeline`) cancels the active AI job via `aiScheduler.cancelAiJob`, resets request status to `idle`, and clears the streaming buffer.

### 5. Post-Chat Jobs
After the response completes:
- **Auto-summarization**: If context usage > 55%, older turns are folded into a summary

Cloud providers use the same orchestration and local tool loop as LM Studio. Their
API keys are supplied by the Rust credential store at request time. Provider presets
and custom OpenAI-compatible endpoints share the normalized Chat Completions stream
path, so cloud selection does not change message or tool execution behavior.

---

# chat > 02-tools

> Source: `docs/chat/02-tools.md`

# Chat Tools

If the model returns tool calls, they are executed in rounds with re-prompting after each round. Standard mode allows up to 6 rounds; enhanced mode allows up to 10.

## Registered Tools

| Tool | Required Flag | Description |
|------|--------------|-------------|
| `web_search` | `webSearchEnabled` | Search the web via the bundled DonSeTch engine with optional intent selection |
| `scratchpad_write` | `enhancedMode` | Persistent working notes across tool rounds |
| `ask_question` | `enhancedMode` | Pause execution and ask the user a question |

## Enhanced Mode

When enhanced mode is enabled (`enhancedModeEnabled` setting):
- Two additional tools become available: `scratchpad_write` and `ask_question`
- Max tool rounds increase from 6 to 10
- The scratchpad persists across rounds as working memory for the model

## Tool Round Execution

1. Model returns one or more tool calls
2. Web search calls are executed in parallel via `Promise.all`
3. Other tools execute sequentially
4. Results are collected and formatted as tool response messages
5. Results are fed back to the model for re-prompting
6. Loop continues until model produces a text response or max rounds reached

## Retry Logic

- Web searches retry up to 2 times on failure (`TOOL_RETRY_LIMIT = 2`)

Native `code_execution` is not offered to models. Legacy calls fail closed until an OS-enforced sandbox is implemented.

## Tool Registry

Tools are registered in `src/lib/tool-registry.ts` with JSON Schema definitions. Each tool specifies:
- Name and description
- Parameter schema (JSON Schema format)
- Required state flags (web search must be enabled, etc.)

---

# chat > 03-context-window

> Source: `docs/chat/03-context-window.md`

# Context Window Management

## Token Estimation

Uses a **4-chars-per-token heuristic** (`src/lib/context.ts`) — simple but effective for trimming decisions. The token budget is calculated as:

```
token_budget = context_limit - reserved_output_tokens
```

Messages are trimmed oldest-first until the budget is satisfied.

## Auto-Summarization

When context usage exceeds 55%:
- Older turns are folded into a conversation summary
- The summary preserves the last 8 messages verbatim
- Summary is injected as `<veyra_conversation_summary>` block

## Context Stats

The UI displays:
- Estimated tokens used
- Percentage of context window used
- Number of included/dropped messages

## Message Trimming Strategy

1. Start from the most recent message and work backwards
2. Include messages until the token budget is exhausted
3. Remaining messages are dropped from context
4. The summary block preserves information from dropped messages

---

# chat > 04-streaming

> Source: `docs/chat/04-streaming.md`

# Chat Streaming

The UI supports real-time streaming of multiple content types during AI response generation.

## Stream Types

| Type | Description |
|------|-------------|
| Content tokens | The AI's response text |
| Reasoning tokens | Chain-of-thought (shown in expandable block) |
| Web search state | Search/fetch/reading progress indicators |
| Tool calls | Live tool execution indicators |

## Stream Architecture

- Provider adapter streams tokens via callbacks
- Content tokens update the message buffer character by character
- Reasoning tokens are accumulated separately for display in expandable sections
- Tool call updates are merged into the message's tool call state
- Web search progress updates the search state indicator

## Stop / Cancel

While streaming, pressing **Escape** stops the active generation. The `Composer` component listens for `Escape` when `busy` and calls `onStop`, which cancels the AI job via `aiScheduler.cancelAiJob` and resets streaming state.

## Provider Compatibility

Both LM Studio and cloud providers use the same streaming interface, ensuring consistent UI behavior regardless of provider.

---

# chat > 05-storage

> Source: `docs/chat/05-storage.md`

# Conversation Storage

## Encryption

- Conversations are encrypted with **AES-GCM** and authenticated snapshot revisions
- Web Workers handle encryption/decryption without blocking the UI
- Encryption keys live in the operating-system credential vault
- Legacy plaintext key files are migrated to the vault and removed on startup

## Persistence

- Debounced saves (500ms) to avoid excessive I/O
- Atomic primary writes retain one rotating encrypted backup
- An emergency browser copy is compared by authenticated revision during recovery
- Failed recovery blocks writes and displays a persistent warning

## File Format

Each conversation is serialized as an encrypted JSON file containing:
- Messages array with content, reasoning, tool calls, and web search state
- Metadata (title, mode, project binding, timestamps)
- Conversation summary (if auto-summarized)

---

# chat > 06-types

> Source: `docs/chat/06-types.md`

# Chat Key Types

Accurate as of the current source code (`src/modules/chat/chat-types.ts`).

## Core Message Types

```typescript
type ChatRole = "user" | "assistant" | "system";

type ChatMode = "chat" | "agents" | "research";

type WorkspaceChatMode = "chat" | "agents";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  attachments?: MessageAttachment[];
  reasoning?: string;
  timestamp: number;
  performance?: MessagePerformance;
  webSearchSources?: WebSearchSource[];
  webSearchState?: WebSearchState;
  toolStates?: ToolCallState[];
  scratchpadContent?: string;
  modelId?: string;
}
```

## Tool Call Types

```typescript
type ToolCallPhase = "pending" | "running" | "retrying" | "done" | "error";

type ToolCallState = {
  id: string;
  name: string;
  label: string;
  phase: ToolCallPhase;
  input?: string;
  detail?: string;
  error?: string;
  attempts?: number;
  result?: unknown;
};
```

## Web Search Types

```typescript
type WebSearchPhase = "searching" | "fetching" | "reading" | "done" | "error";

type WebSearchRound = {
  id: string;
  query: string;
  phase: WebSearchPhase;
  sources: WebSearchSource[];
  fetch_progress?: { completed: number; total: number };
  error?: string;
};

type WebSearchState = {
  rounds: WebSearchRound[];
};
```

## Conversation

```typescript
interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  projectId?: string;
  lmResponseId?: string;
  conversationSummary?: string;
  summaryCoversMessageCount?: number;
}
```

## Context Breakdown

```typescript
type ContextBlockCategory =
  | "system_core" | "model_identity" | "user_prompt"
  | "project" | "summary"
  | "context_anchor"
  | "tool_definitions" | "web_search_results"
  | "user_message" | "assistant_message" | "system_message";

interface ContextBlock {
  category: ContextBlockCategory;
  label: string;
  tokenCount: number;
  dropped: boolean;
  detail?: string;
}

interface ContextBreakdown {
  systemBlocks: ContextBlock[];
  messageBlocks: ContextBlock[];
  droppedCount: number;
  totalSystemTokens: number;
  totalMessageTokens: number;
  totalTokens: number;
  contextLimit: number;
  reservedOutputTokens: number;
}
```

## Provider Types

```typescript
interface ProviderInfo {
  id: string;
  name: string;
  icon: string;
  status: "connected" | "disconnected";
}

interface ModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  size?: string;
  supportsImages?: boolean;
}
```

## ChatPanelProps

```typescript
interface ChatPanelProps {
  messages?: ChatMessage[];
  onSend?: (text: string, attachments?: MessageAttachment[]) => void;
  onStop?: () => void;
  onEditMessage?: (messageId: string) => void;
  onEditCancel?: () => void;
  onEditSave?: (messageId: string, newContent: string) => void;
  onRegenerate?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  onCopyMessage?: (messageId: string) => void;
  onForkMessage?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  isStreaming?: boolean;
  streamingMessageId?: string | null;
  editingMessageId?: string | null;
  editInitialValue?: string;
  supportsImages?: boolean;
  providers?: ProviderInfo[];
  models?: ModelInfo[];
  mode?: ChatMode;
  /** 0 = both open, 1 = one collapsed, 2 = both collapsed */
  sidebarsCollapsed?: number;
  title?: string;
  titleAccessory?: ReactNode;
  headerActions?: ReactNode;
}
```

## Performance

```typescript
interface MessagePerformance {
  tokensPerSecond: number;
  timeToFirstToken: number;
  generationTime: number;
  totalTime: number;
  outputTokens: number;
  inputTokens?: number;
  totalTokens?: number;
  stopReason?: string;
}
```

---

# chat > README

> Source: `docs/chat/README.md`

# Chat Module

Core AI chat pipeline with streaming, tool calls, and context window management.

## Contents

- [01-pipeline.md](01-pipeline.md) — Pipeline flow and orchestration
- [02-tools.md](02-tools.md) — Tool call execution
- [03-context-window.md](03-context-window.md) — Context window management
- [04-streaming.md](04-streaming.md) — Streaming behavior
- [05-storage.md](05-storage.md) — Conversation encryption and persistence
- [06-types.md](06-types.md) — Key type definitions

---

# hooks > 01-overview

> Source: `docs/hooks/01-overview.md`

# Hooks

React hooks used across Veyra's frontend for chat, scheduling, and UI interactions.

## Chat Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useChatSend` | `src/hooks/use-chat-send.ts` | Message send logic |
| `useChatPipeline` | `src/hooks/use-chat-pipeline.ts` | Pipeline lifecycle — returns `handleSend`, `handleStopStreaming`, `handleEdit*`, `handleRegenerate`, `handleCopyMessage`, `handleForkMessage`, `handleDeleteMessage`, streaming state, and provider info |
| `useChatAttachments` | `src/hooks/use-chat-attachments.ts` | File attachment management |
| `useChatEditing` | `src/hooks/use-chat-editing.ts` | Message editing |
| `useChatRegeneration` | `src/hooks/use-chat-regeneration.ts` | Response regeneration |
| `useChatContextPanel` | `src/hooks/use-chat-context-panel.ts` | Context panel state |

## Scheduler Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useAiScheduler` | `src/hooks/use-ai-scheduler.ts` | AI job scheduling |
| `runChatJob` | `src/hooks/run-chat-job.ts` | Chat job execution |

## Agent Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useAgentDispatch` | `src/hooks/use-agent-dispatch.ts` | Agent dispatch logic |

## UI Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useClickOutside` | `src/hooks/use-click-outside.ts` | Click-outside detection |
| `useAppZoom` | `src/hooks/use-app-zoom.ts` | App zoom control |
| `useShutdownState` | `src/hooks/use-shutdown-state.ts` | Shutdown state tracking |
| `useAppUpdateCheck` | `src/hooks/use-app-update-check.ts` | Update notification check |

---

# hooks > README

> Source: `docs/hooks/README.md`

# Hooks

React hooks used across Veyra's frontend for chat, scheduling, and UI interactions.

## Contents

- [01-overview.md](01-overview.md) — Complete list of hooks and their purposes

---

# extensions > 01-mcp-servers

> Source: `docs/extensions/01-mcp-servers.md`

# MCP Servers

Veyra integrates MCP servers via the `rmcp` Rust SDK. Two transports are supported:

- **Streamable HTTP** — Remote MCP servers over HTTP. Non-localhost endpoints require HTTPS.
- **stdio** — Local child processes spawned by Veyra. Never invoked through a shell.

## Key Files

| File | Purpose |
|------|---------|
| `src-tauri/src/extensions/commands.rs` | All Tauri MCP commands (discovery, tool call, resource read, prompt fetch) |
| `src/modules/extensions/mcp-tool-adapter.ts` | Frontend adapter: tool name resolution, invocation routing |
| `src/modules/extensions/extension-types.ts` | `McpServerRecord`, `McpTransport`, `CapabilityGrant`, `PermissionCategory` |
| `src/modules/extensions/extensions-store.ts` | Zustand store with persistence for servers, grants, diagnostics |
| `src/modules/extensions/capability-catalog.ts` | Classifies MCP tool side effects, builds unified capability catalog |
| `src/modules/extensions/components/mcp-server-settings.tsx` | Settings UI: add, connect, inspect, grant permissions |
| `src/modules/extensions/components/mcp-chat-toggle.tsx` | Per-chat MCP server enable/disable toggle in composer |

## Tauri Commands

| Command | Purpose |
|---------|---------|
| `discover_streamable_http_mcp` | Connects to an HTTP MCP endpoint and discovers tools/resources/prompts |
| `discover_stdio_mcp` | Starts a stdio MCP process and discovers capabilities |
| `call_streamable_http_mcp` | Calls a tool on a remote MCP server |
| `call_stdio_mcp` | Calls a tool on a local stdio MCP server |
| `read_streamable_http_mcp_resource` | Reads a resource from a remote MCP server |
| `read_stdio_mcp_resource` | Reads a resource from a local stdio MCP server |
| `get_streamable_http_mcp_prompt` | Retrieves a prompt template from a remote MCP server |
| `get_stdio_mcp_prompt` | Retrieves a prompt template from a local stdio MCP server |

All connections are one-shot: the SDK client connects, performs the operation, and closes. Persistent sessions are not managed by Veyra.

## Capability Discovery

When a server is saved and enabled, `connect()` runs the appropriate discovery command. The result is stored in the `McpServerRecord.capabilities` field as a fingerprint. A changed fingerprint invalidates prior capability grants.

## Permission Model

MCP tool calls require explicit approval before execution. Grants are stored in the extensions store with the following scopes:

| Scope | Behavior |
|-------|----------|
| `once` | Single-use, expires after 5 minutes |
| `chat` | Allowed for the duration of the current chat |
| `project` | Allowed for the current project |
| `all` | Allows all non-destructive tools from the server |

Destructive tools (delete, destroy, drop, remove, terminate, reset, wipe) always require a fresh one-time approval. Approvals are tied to the server's capability fingerprint and are revoked automatically when the fingerprint changes.

## Safety Controls

The extensions settings page exposes four feature flags that can disable entire categories:

| Flag | Effect |
|------|--------|
| `skills` | Disables all skill context injection |
| `mcp` | Disables all MCP execution |
| `stdio` | Disables local stdio-based MCP servers |
| `streamableHttp` | Disables remote Streamable HTTP MCP servers |

MCP servers are off by default for each chat. The user must explicitly enable a server in the `McpChatToggle` component before the model can call its tools.

---

# extensions > 02-skills

> Source: `docs/extensions/02-skills.md`

# Skills

Skills are local, reviewed Markdown instruction packages (SKILL.md) that guide the AI chat behavior. They are declarative only — they cannot execute code, modify permissions, or self-activate.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/extensions/skill-runtime.ts` | Validation, `draftToSkill` conversion, context block builder |
| `src/modules/extensions/skill-generator.ts` | AI-powered skill draft generation via the provider |
| `src/modules/extensions/extension-types.ts` | `SkillRecord`, `SkillDraft`, `SkillValidation`, `SkillWorkflow` |
| `src/modules/extensions/capability-catalog.ts` | Lists `WorkflowCapability` entries from installed skills |
| `src/modules/extensions/components/skill-selector.tsx` | Composer dropdown to pick a skill/workflow |
| `src/modules/extensions/components/project-skills-settings.tsx` | Project-scoped skill and MCP server enable/disable |
| `src/components/settings/extensions-settings.tsx` | Settings page for importing, generating, and managing skills |

## SKILL.md Format

A skill package is a directory (or ZIP archive) containing at minimum a `SKILL.md` at its root:

```markdown
# Skill Name

Declarative instructions for the AI model.
```

Optional files:

- `veyra.json` — Manifest with `id`, `version`, `description`, `requiredCapabilities`, and `workflows`.
- Any relative-path assets (SVG, text, etc.) referenced from the manifest.

### SKILL.md Frontmatter

Skills can include YAML frontmatter between `---` delimiters:

```markdown
---
name: Release Notes
description: Writes concise release notes
version: 2.0.0
---

Write release notes in a brief, scoped format.
```

### veyra.json

```json
{
  "id": "skill.release-notes",
  "version": "2.0.0",
  "description": "Release notes generator",
  "requiredCapabilities": ["mcp.github.create_issue"],
  "workflows": [
    {
      "id": "brief",
      "name": "Brief",
      "instructions": "Use three bullets only."
    }
  ],
  "prompts": ["prompts/template.md"],
  "resources": ["assets/example.txt"]
}
```

## Validation Rules

- SKILL.md must not exceed 60,000 characters.
- No executable activation hooks (`onInstall`, `onActivate`, `postinstall`, `preinstall`) are permitted.
- Code blocks are retained as instruction text only and will never execute.
- Package imports reject symbolic links, path traversal, and files over 512 KB.
- SVG assets are scanned for active content (`<script>`, `onload=`, etc.).
- Total package limit: 5 MB, 200 files.

## Import Methods

| Method | Tauri Command | Source |
|--------|--------------|--------|
| Folder import | `snapshot_skill_directory` | User-selected directory |
| ZIP import | `snapshot_skill_zip` | User-selected ZIP archive |
| AI generation | `generateSkillDraft` | Provider generates a draft from a description |

## Skill Context Injection

When a skill is active for a chat, the orchestrator injects a `<veyra_active_skill>` context block into the system prompt containing the skill instructions and optional workflow instructions.

## Skill Snapshots

Each user message records its active skill as a `skillSnapshot` (`{ id, version, workflowId? }`). The orchestrator resolves the snapshot against the installed skills at response time, ensuring skill versions stay consistent across a conversation.

---

# extensions > 03-chat-integration

> Source: `docs/extensions/03-chat-integration.md`

# Chat Integration

Extensions integrate into the chat pipeline at three points: tool registration, tool execution, and context injection.

## Tool Registration

In `src/modules/chat/chat-provider-options.ts`, `resolveProviderTooling()` appends MCP tools to the provider's tool list:

```typescript
buildMcpProviderTools(extensions.mcpServers, projectId, featureFlags, disabledServerIds)
```

Each MCP tool is namespaced as `mcp_<serverId>_<toolName>` to avoid collisions. The tool description is prefixed with `[MCP: <server name>]`.

## Tool Execution

In `src/modules/chat/chat-tool-rounds.ts`, `executeToolRound()` routes any tool call starting with `mcp_` through the MCP adapter:

1. **Resolve** — Match the tool name to an `McpServerRecord` and tool name.
2. **Gate** — Check chat-level enable, server health, project scope, and transport feature flags.
3. **Permission** — Require a `CapabilityGrant` via `findCapabilityGrant`. Destructive tools always need a fresh one-time approval.
4. **Invoke** — Call `invokeMcpTool` which dispatches to the appropriate Tauri command.
5. **Format** — Cap output at 60 KB to prevent context flooding.

Tool call results are rendered in the chat UI's tool call indicators, with `mcpApproval` metadata for permission requests.

## Skill Context Injection

In `src/modules/chat/chat-orchestrator.ts`, `sendChatRequest()` resolves the active skill:

```typescript
const activeSkill = extensionState.resolveActiveSkillSelection(conversationId, projectId);
const skillContextBlock = activeSkill ? buildSkillContext(activeSkill.skill, activeSkill.workflowId) : undefined;
```

The resulting `<veyra_active_skill>` XML block is added to the system prompt alongside other context blocks.

## UI Components

| Component | Location | Role |
|-----------|----------|------|
| `SkillSelector` | Composer toolbar | Select an active skill or workflow per chat |
| `McpChatToggle` | Composer toolbar | Enable/disable MCP servers for the current chat |
| `ProjectSkillsSettings` | Project settings | Restrict skills and MCP servers per project |
| `ExtensionsSettings` | Settings → Extensions | Full skill and MCP server management |
| `McpServerSettings` | Settings → Extensions | Add, inspect, connect, and grant MCP permissions |

## Data Flow

```
Settings page
  ├─ Import / generate skill → extensions-store (persisted)
  ├─ Add MCP server → Tauri discovery command → extensions-store
  └─ Grant permissions → extensions-store

Composer toolbar
  ├─ SkillSelector → activeSkillId → extensions-store
  └─ McpChatToggle → chatDisabledMcpServerIds → extensions-store

Send message
  └─ useChatSend → attaches skillSnapshot to user message

Chat orchestrator
  ├─ resolveActiveSkillSelection → buildSkillContext → system prompt
  └─ resolveProviderTooling → buildMcpProviderTools → tool definitions

Tool execution
  └─ executeToolRound → mcpCalls → resolveMcpTool → grant check → invokeMcpTool
```

---

# extensions > 04-types

> Source: `docs/extensions/04-types.md`

# Extension Key Types

Accurate as of the current source code (`src/modules/extensions/extension-types.ts`).

## Core Types

```typescript
type ExtensionType = "skill" | "mcp_server";
type ExtensionHealth = "ready" | "disabled" | "degraded" | "failed";

type ExtensionRecord = {
  id: string;
  type: ExtensionType;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  provenance: "local" | "generated" | "manual";
  installedAt: string;
  updatedAt: string;
  health: ExtensionHealth;
};
```

## Skill Types

```typescript
type SkillWorkflow = { id: string; name: string; instructions: string };

type SkillRecord = ExtensionRecord & {
  type: "skill";
  instructions: string;
  workflows: SkillWorkflow[];
  contentHash: string;
  snapshotId?: string;
  requestedCapabilities: string[];
};

type SkillDraft = {
  name: string;
  description: string;
  source: string;
  provenance: "local" | "generated";
  packageManifest?: string;
  packageFiles?: string[];
};

type SkillValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  name?: string;
  description?: string;
  version?: string;
  instructions?: string;
};
```

## MCP Server Types

```typescript
type McpTransport = "stdio" | "streamable_http";

type McpServerRecord = ExtensionRecord & {
  type: "mcp_server";
  transport: McpTransport;
  endpoint?: string;
  executable?: string;
  arguments?: string[];
  workingDirectory?: string;
  timeoutMs: number;
  projectIds: string[];
  capabilityCount: { tools: number; resources: number; prompts: number };
  capabilityFingerprint?: string;
  lastError?: string;
  lastConnectedAt?: string;
  capabilities?: { tools: unknown[]; resources: unknown[]; prompts: unknown[] };
};
```

## Permission Types

```typescript
type PermissionCategory =
  | "read_local_files" | "write_local_files"
  | "execute_external_processes" | "access_internet"
  | "read_documents" | "modify_documents"
  | "read_memory" | "modify_memory"
  | "access_credentials" | "external_mutation"
  | "destructive";

type CapabilityGrant = {
  id: string;
  serverId: string;
  capabilityId: string;
  projectId?: string;
  chatId?: string;
  category: PermissionCategory;
  decision: "allow" | "deny";
  expiresAt?: string;
  usesRemaining?: number;
  createdAt: string;
  revokedAt?: string;
  capabilityFingerprint?: string;
};
```

## Capability Catalog

```typescript
type SideEffectLevel = "read" | "local_write" | "external_write" | "destructive";

type ToolCapability = {
  kind: "tool";
  id: string;
  serverId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  sideEffect: SideEffectLevel;
};
```

## Store State

```typescript
type ExtensionsStore = {
  featureFlags: { skills: boolean; mcp: boolean; stdio: boolean; streamableHttp: boolean };
  skills: SkillRecord[];
  mcpServers: McpServerRecord[];
  grants: CapabilityGrant[];
  diagnostics: ExtensionDiagnostic[];
  policies: Record<string, ProjectExtensionPolicy>;
  activeSkillIds: Record<string, string | null>;
  activeSkillWorkflowIds: Record<string, string | undefined>;
  chatDisabledMcpServerIds: Record<string, string[]>;
};
```

## ToolCallState Extension

In `src/modules/chat/chat-types.ts`, the `ToolCallState` type includes an optional MCP approval field:

```typescript
mcpApproval?: {
  serverId: string;
  toolName: string;
  projectId?: string;
  chatId?: string;
  capabilityFingerprint?: string;
};
```

---

# extensions > README

> Source: `docs/extensions/README.md`

# Extensions Module

MCP (Model Context Protocol) server integration and local SKILL.md instruction packages for the chat pipeline.

## Contents

- [01-mcp-servers.md](01-mcp-servers.md) — MCP server discovery, transport, capability inspection
- [02-skills.md](02-skills.md) — Skill runtime, validation, AI generation
- [03-chat-integration.md](03-chat-integration.md) — MCP tools and skill context in chat
- [04-types.md](04-types.md) — Key type definitions

---

# research > 01-pipeline

> Source: `docs/research/01-pipeline.md`

# Research Pipeline

Deep research pipeline with background research, 9 core phases, and citation auditing. Supports multiple depth presets, plan approval, source scoring, contradiction detection, and evidence extraction.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/research/research-types.ts` | Comprehensive type system |
| `src/modules/research/research-store.ts` | Zustand store with full CRUD |
| `src/modules/research/research-runtime.ts` | Research execution engine |
| `src/modules/research/research-runtime-context.ts` | Runtime context and state |
| `src/modules/research/research-lifecycle.ts` | Interrupted run handling |
| `src/modules/research/research-background-phase.ts` | Background research (Phase 0) |
| `src/modules/research/research-plan-phase.ts` | Plan generation (Phase 1) |
| `src/modules/research/research-search-phase.ts` | Search execution (Phase 2) |
| `src/modules/research/research-read-phase.ts` | Source reading (Phase 3) |
| `src/modules/research/research-verify-phase.ts` | Validate + Verify (Phases 4, 6) |
| `src/modules/research/research-extract-phase.ts` | Evidence extraction (Phase 5) |
| `src/modules/research/research-gap-phase.ts` | Gap analysis (Phase 7) |
| `src/modules/research/research-synthesis-phase.ts` | Report synthesis + Citation audit (Phase 8) |
| `src/modules/research/research-output-budgets.ts` | Per-phase output token budgets and scaling functions |

## Pipeline Phases

### Phase 0: Background Research
Searches for contextual snippets before the plan phase, providing the LLM with preliminary information.

### Phase 1: Plan
- LLM generates a structured research plan with steps, search queries, and expected source types
- **Plan approval flow**: users can review and edit the plan before execution

### Phase 2: Search
- Executes searches using the web search orchestrator
- Multi-query planning with concurrent execution and query limits per depth

### Phase 3: Read
- Fetches and reads source content via Tauri backend
- Deduplication of identical sources

### Phase 4: Validate
- Scores source quality across multiple dimensions (relevance, credibility, currency, depth)
- Sources below quality thresholds are filtered out

### Phase 5: Extract
- Extracts evidence from validated sources
- Evidence types: claims, statistics, quotes, facts, methodologies

### Phase 6: Verify
- Cross-references claims across multiple sources
- **Contradiction detection**: Trigram-Jaccard similarity + LLM dedup
- Claims supported by multiple sources are marked as verified

### Phase 7: Gap Analysis
- Identifies missing information and generates follow-up queries
- May loop back to search if significant gaps exist

### Phase 8: Synthesize + Citation Audit
- Generates a cited report with citation maps linking claims to sources
- **Citation Audit**: Full citation-accuracy audit against original sources, verifying every claim-reference mapping

### Phase 9: Finalize
- Saves the report and sets status to `completed`
- Optional export to a markdown/text file

The `ResumePhase` type in `research-runtime.ts` tracks: `"background" | "plan" | "search" | "read" | "validate" | "extract" | "verify" | "gap" | "synthesize"`.

---

# research > 02-depth-presets

> Source: `docs/research/02-depth-presets.md`

# Research Depth Presets

| Preset | Rounds | Max Sources | ArXiv | Wikipedia | Contradiction | Audit |
|--------|--------|-------------|-------|-----------|---------------|-------|
| `lightning` | 1 | 15 | No | No | No | No |
| `quick` | 3 | 35 | No | No | No | Yes (5 citations) |
| `standard` | 5 | 75 | No | Yes | No | Yes |
| `deep` | 8 | 150 | Yes | Yes | Yes (200 pairs) | Yes |
| `exhaustive` | 10 | 300 | Yes | Yes | Yes (500 pairs) | Yes |

## Configuration

Each preset configures 31 parameters including:
- `searchRounds`, `maxSources`, `queriesPerStep`
- `perSourceRead`, `crossSourceVerify`
- `contradictionDetect`, `contradictionMaxPairs`, `contradictionTopK`
- `gapAnalysis`, `selfCritiquePass`
- `maxSections`, `sectionMaxWords`
- `reasoningEnabled`, `enableArxiv`, `enableWikipedia`
- `adaptiveDeepening`, `auditMaxCitations`

Config is defined in `src/modules/research/research-config.ts`. Custom profiles are supported.

---

# research > 03-source-types

> Source: `docs/research/03-source-types.md`

# Research Source Types

From `src/modules/research/research-types.ts`:

| Type | Description |
|------|-------------|
| `webpage` | General web page |
| `pdf` | PDF document |
| `news` | News article |
| `docs` | Documentation site |
| `github` | GitHub repository/code |
| `wikipedia` | Wikipedia article |
| `forum` | Forum discussion |
| `package` | Software package (npm, pip, etc.) |
| `youtube` | YouTube video |
| `arxiv` | ArXiv paper |
| `epub` | EPUB ebook |
| `docx` | Word document |
| `pptx` | PowerPoint presentation |
| `xlsx` | Excel spreadsheet |
| `unknown` | Unclassified source |

## Source Quality Scoring

Sources are scored on credibility using `src/modules/research/source-credibility.ts` considering:
- Domain authority
- Publication recency
- Content depth and structure
- Citation presence

## Source Statuses

| Status | Description |
|--------|-------------|
| `discovered` | Found via search but not yet fetched |
| `fetched` | Content downloaded |
| `read` | Content extracted and parsed |
| `failed` | Fetch or extraction failed |
| `skipped` | Intentionally bypassed |

---

# research > 04-pause-resume

> Source: `docs/research/04-pause-resume.md`

# Research Pause and Resume

## Mid-Run Pause

- Research runs can be paused mid-execution
- `AbortController` handles graceful shutdown of active fetches
- Paused runs transition to `paused` status
- State is persisted so runs survive app restarts

## Resume

- Paused runs can be resumed from their last completed phase
- Phase state is tracked per run, enabling precise continuation
- Interrupted runs (app close/crash) are automatically set to `paused` on next launch

## Lifecycle

`research-lifecycle.ts` handles:
- Interrupted run reconciliation on app start
- Graceful shutdown on app close
- Signal handling for clean cancellation

---

# research > 05-report-export

> Source: `docs/research/05-report-export.md`

# Research Report Export

Reports can be exported to a file after the research pipeline completes.

## Export Targets

| Target | Description |
|--------|-------------|
| File | Direct markdown/text file export |

## Citation Maps

Exported reports include citation maps linking claims to their source evidence, enabling traceable, verifiable research output.

---

# research > 06-types

> Source: `docs/research/06-types.md`

# Research Key Types

From `src/modules/research/research-types.ts`:

```typescript
type ResearchDepth = "lightning" | "quick" | "standard" | "deep" | "exhaustive";

type ResearchRunStatus =
  | "planning" | "searching" | "reading" | "extracting"
  | "verifying" | "synthesizing" | "completed" | "failed" | "paused";

type ResearchSourceType =
  | "webpage" | "pdf" | "news" | "docs" | "github"
  | "wikipedia" | "forum" | "package" | "youtube" | "arxiv"
  | "epub" | "docx" | "pptx" | "xlsx" | "unknown";

type ResearchSourceStatus =
  | "discovered" | "fetched" | "read" | "failed" | "skipped";

type ResearchStepType =
  | "clarify" | "plan" | "background" | "search" | "read"
  | "extract" | "verify" | "synthesize" | "report" | "follow_up";

type ResearchStepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

type ResearchEvidenceType =
  | "claim" | "statistic" | "quote" | "fact" | "methodology" | "example" | "counter";

interface ResearchRun {
  id: string;
  question: string;
  depth: ResearchDepth;
  status: ResearchRunStatus;
  plan?: ResearchPlan;
  reportId?: string;
  projectId?: string;
  progressPercent: number;
  modelUsed?: string;
  providerId?: string;
  totalTokensUsed?: number;
  searchProvider?: string;
  currentStepId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface ResearchSource {
  id: string;
  url: string;
  title: string;
  sourceType: ResearchSourceType;
  sourceQuality?: {
    relevant: boolean;
    quality: number;
    relevanceScore?: number;
  };
  fetchedAt?: string;
}

interface ResearchEvidence {
  id: string;
  sourceId: string;
  claim: string;
  type: ResearchEvidenceType;
  confidence: number;
  context?: string;
  pageNumber?: string;
  tags?: string[];
  stepId?: string;
}

interface ResearchClaim {
  id: string;
  text: string;
  evidenceId: string;
  sourceId: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  verified: boolean;
  verifiedBy?: string;
  contradictedBy?: string;
  disputedBy?: string;
  needsSemanticReview?: boolean;
  verificationReason?: string;
}
```

---

# research > README

> Source: `docs/research/README.md`

# Research Module

Deep research pipeline with 9 phases, multi-depth presets, source scoring, and citation auditing.

## Contents

- [01-pipeline.md](01-pipeline.md) — The 9-phase research pipeline
- [02-depth-presets.md](02-depth-presets.md) — Research depth configurations
- [03-source-types.md](03-source-types.md) — Source types and credibility scoring
- [04-pause-resume.md](04-pause-resume.md) — Pause/resume and lifecycle handling
- [05-report-export.md](05-report-export.md) — Report export to files
- [06-types.md](06-types.md) — Key type definitions

---

# web-search > 01-setup

> Source: `docs/web-search/01-setup.md`

# Web Search Setup

Veyra ships its own local search engine. There is no Docker dependency, no Python install, and no user-configured search URL.

## Bundled engine

The engine is [DonSeTch](https://github.com/dondai44423/donsetch), a Rust single-binary metasearch server. Veyra pins one release and runs it as a separate process over loopback MCP.

| Piece | Location |
|-------|----------|
| Engine binary and DLLs | `src-tauri/resources/search-engine/` (not committed) |
| Rerank model | `src-tauri/resources/search-engine/rerank/` |
| Runtime cache | `<app-data>/search-engine/` |
| Log | `<app-data>/logs/search-engine.log` |
| Fetch script | `scripts/fetch-search-engine.mjs` |

`npm run dev:app` and `npm run build:app` call `fetch-search-engine.mjs` automatically. It downloads the pinned `donsetch-win32-x64.tar.gz` (or the asset for the current platform), verifies the published SHA256, and fetches the 23 MB rerank model from Hugging Face.

The artifact is intentionally ignored by git. Run `npm run search-engine:fetch` after cloning if you are not using the npm scripts.

## Lifecycle

1. `SearchEngineState` is created during Tauri setup.
2. It reserves an ephemeral loopback port and generates a per-session bearer token.
3. It starts `donsetch mcp --http --host 127.0.0.1 --port <port>` with `CREATE_NO_WINDOW`.
4. The bundled rerank model is copied into the app cache on first launch.
5. The engine is polled at `/health` until ready (25 s budget).
6. On window close and `ExitRequested`, the process tree is killed with `taskkill /T /F` and `Child::kill`.
7. `Drop` for the engine state is a final safety net if the app exits unexpectedly.

`web_search` waits for engine readiness, calls the MCP `web_search` tool, and maps `_meta["com.donsetch/search-debug"].results` into Veyra's search response.

## Security

- The engine binds `127.0.0.1` only.
- The MCP endpoint requires `Authorization: Bearer <random token>` per session.
- The token is never persisted or exposed to the frontend.
- Search requests are made by the Rust supervisor, not the webview.
- The engine runs as a separate process; Veyra does not link it as a crate.

## Licensing

DonSeTch is AGPL-3.0. The fetch script copies its `LICENSE` and a `SOURCE-OFFER.txt` into the resource directory. Keep both in the installer. If Veyra ever patches the engine, publish the patch under the AGPL.

---

# web-search > 02-search-flow

> Source: `docs/web-search/02-search-flow.md`

# Web Search Flow

## One query, intent-aware

`SearchOrchestrator.runSearch()` sends a single query to the bundled DonSeTch engine. Veyra's previous multi-query expansion, RRF fusion, and adaptive fallback pipeline has been removed; DonSeTch performs its own multi-engine consensus, semantic reranking, and authority placement internally.

The model can supply an explicit `intent`, or omit it and let the engine infer one. Veyra maps its intent names to DonSeTch intents:

| Veyra intent | DonSeTch intent | Adds |
|--------------|-----------------|------|
| `general` | `web` | General web results |
| `news` | `news` | Google News, Hacker News |
| `academic` | `paper` | Google Scholar, arXiv |
| `code` | `code` | GitHub, Hacker News, Stack Exchange, MDN |
| `documentation` | `code` | GitHub, Hacker News, Stack Exchange, MDN |
| `local` | `web` | General web results |
| `discussion` | `web` | General web results |

There is no category/engine routing, time-range filter, safe-search level, language parameter, or pagination in the engine API. Those controls were removed from Settings and the tool schema.

## Supplementary providers

When the Advanced Search Bundle is enabled, ArXiv and Wikipedia direct APIs run in parallel with DonSeTch and are merged by URL. Research depth profiles can disable either provider per run.

## Deduplication

Results are merged in order (DonSeTch, ArXiv, Wikipedia) and deduplicated by a normalized URL key:

- hostname lowercased and `www.` stripped
- fragment removed
- trailing slash removed
- query string preserved

The result list is capped at the user's "Results per search" setting (1–12).

## Page fetching

- Top results are fetched through Tauri IPC (`fetch_and_extract_pages`).
- HTML, PDF, Office documents, EPUB, and YouTube transcripts use the existing extraction handlers.
- Wayback Machine fallback is available when enabled.
- Fetch status is tracked per source.

## Passage ranking

After fetching, `passage-ranker.ts` splits each page into blocks, scores them against the query, and returns the top passages with heading context and offsets. The context bundle prefers passages over raw page content.

## Speed preset

| Preset | Effect |
|--------|--------|
| `"fast"` | Skips page fetching, returns up to 3 snippet-only results, disables direct ArXiv/Wikipedia providers |
| `"normal"` | Full-quality search respecting user settings |

The research pipeline uses `"normal"` for background and gap-phase searches.

## Diagnostics

`SearchContextBundle.diagnostics` reports:

- the single executed query
- per-provider result counts
- `degraded` when DonSeTch reports unavailable upstream engines

---

# web-search > 03-providers

> Source: `docs/web-search/03-providers.md`

# Search Providers

| Provider | Description |
|----------|-------------|
| DonSeTch | Bundled local metasearch engine — primary provider |
| ArXiv | Direct ArXiv API for academic papers (optional) |
| Wikipedia | Direct Wikipedia API (optional) |

## Provider architecture

Each provider implements a common interface in `src/modules/web-search/providers/`:

- accepts search input (query, limit, intent)
- returns normalized `SearchResult` objects
- is selected by the orchestrator based on settings and research depth

## DonSeTch provider

`DonSeTchProvider` calls the Rust `web_search` command, which talks to the bundled engine over authenticated loopback MCP. The Rust supervisor owns:

- process start/stop and crash handling
- ephemeral port + bearer token
- rerank model seeding
- MCP session and result mapping

`DonSeTchProvider` only normalizes results: it strips tracking parameters, removes duplicate URLs, drops obvious spam domains, and maps `published_at` into `publishedAt`.

The engine returns ranked URLs, titles, snippets, and scores. It also reports `degraded` when some upstream engines are blocked or unavailable; this is passed through diagnostics rather than treated as a failure.

## ArXiv provider

Direct API access for academic paper searches. Returns paper metadata with links. Gated by `advancedSearchBundleEnabled`, `bundleArxivSearch`, and the active research depth.

## Wikipedia provider

Direct API access for encyclopedia searches. Returns article summaries and links. Gated by `advancedSearchBundleEnabled`, `bundleWikipediaSearch`, and the active research depth.

---

# web-search > 04-integration

> Source: `docs/web-search/04-integration.md`

# Web Search Integration

## Chat tool integration

In chat, the `web_search` tool accepts:

```json
{
  "query": "string",
  "intent": "general | news | academic | code | documentation | local | discussion"
}
```

`intent` is optional. When omitted, DonSeTch infers it from the query.

The tool has retry logic (up to 2 retries) and real-time UI updates:

- **Search phase**: querying the local engine
- **Fetch phase**: downloading content
- **Reading phase**: extracting text

## Research pipeline integration

The research module uses the same orchestrator with:

- multiple queries per research step (generated by the research planner, not by the search provider)
- per-depth ArXiv/Wikipedia overrides
- higher fetch limits for thorough research
- credibility scoring integration

Research runs record `searchProvider: "donsetch"` (or `"auto"` for legacy records).

## Supplementary direct providers

`src/lib/direct-search-providers.ts` decides whether the ArXiv and Wikipedia APIs should run for a search. It requires the Advanced Search Bundle and the corresponding provider toggle, and respects per-run research overrides.

---

# web-search > 05-types

> Source: `docs/web-search/05-types.md`

# Web Search Key Types

From `src/modules/web-search/types.ts`:

```typescript
type SearchInput = {
  query: string;
  limit?: number;
  intent?: SearchIntent;
};

type SearchIntent =
  | "general"
  | "news"
  | "academic"
  | "code"
  | "documentation"
  | "local"
  | "discussion";

interface SearchProvider {
  id: string;
  name: string;
  type: "donsetch" | "brave" | "custom" | "direct_source";
  search(input: SearchInput): Promise<SearchResult[]>;
}

type SearchResult = {
  id: string;
  title: string;
  url: string;
  displayUrl?: string;
  snippet?: string;
  providerId: string;
  engine?: string;
  publishedAt?: string;
  fetchedAt?: string;
  score?: number;
  rank?: number;
  sourceType?:
    | "webpage" | "docs" | "news" | "github" | "wikipedia"
    | "pdf" | "forum" | "package" | "arxiv" | "epub"
    | "docx" | "pptx" | "xlsx";
};

type SearchSource = {
  id: string;
  title: string;
  url: string;
  snippet: string;
  providerId?: string;
  engine?: string;
  sourceType?: SearchResult["sourceType"];
  publishedAt?: string;
  score?: number;
  rank?: number;
  passages?: SearchPassage[];
  fetch?: {
    status: FetchStatus | string;
    error_reason?: string;
    extraction_method?: string;
    via_wayback?: boolean;
    char_count?: number;
    source_type?: string;
  };
};

type SearchContextBundle = {
  query: string;
  summary: string;
  sources: SearchSource[];
  tokenCount: number;
  fetchedPages?: FetchedPageSummary[];
  diagnostics?: {
    queries: Array<{ query: string; lane: string }>;
    providerResultCounts: Record<string, number>;
    fused: boolean;
    fallbackUsed: boolean;
    degraded?: boolean;
  };
};
```

## Engine status types

From `src/modules/web-search/tauri-commands.ts`:

```typescript
type SearchEngineStatusKind = "stopped" | "starting" | "ready" | "failed";

type SearchEngineStatus = {
  state: SearchEngineStatusKind;
  version: string;
  url: string | null;
  message: string | null;
  logPath: string;
};
```

## Intent mapping

| Veyra intent | DonSeTch intent |
|--------------|-----------------|
| `general` | `web` |
| `news` | `news` |
| `academic` | `paper` |
| `code` | `code` |
| `documentation` | `code` |
| `local` | `web` |
| `discussion` | `web` |

---

# web-search > README

> Source: `docs/web-search/README.md`

# Web Search Module

Bundled local web search via DonSeTch, with optional ArXiv and Wikipedia direct APIs.

## Contents

- [01-setup.md](01-setup.md) — Bundled engine, vendoring, lifecycle, and security
- [02-search-flow.md](02-search-flow.md) — Query execution, deduplication, fetching, ranking
- [03-providers.md](03-providers.md) — Search providers (DonSeTch, ArXiv, Wikipedia)
- [04-integration.md](04-integration.md) — Chat tool and research pipeline integration
- [05-types.md](05-types.md) — Key type definitions

---

# projects > 01-overview

> Source: `docs/projects/01-overview.md`

# Projects Overview

Persistent local containers that scope chats, tools, and settings around a goal or workstream.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/projects/project-types.ts` | Type definitions |
| `src/modules/projects/project-store.ts` | Zustand store |
| `src/modules/projects/project-storage.ts` | Tauri IPC layer |

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

---

# projects > 02-settings

> Source: `docs/projects/02-settings.md`

# Project Settings

Per-project settings that override global defaults when the project is active. All settings are optional — they only apply when explicitly set.

| Setting | Type | Description |
|---------|------|-------------|
| `webSearchEnabled` | `boolean` | Enable/disable web search |
| `webSearchMode` | `"auto" \| "always" \| "off"` | Override web search mode |
| `webSearchFetchEnabled` | `boolean` | Enable content fetching for search results |
| `webSearchFetchCount` | `number` | Max pages to fetch per search |
| `webSearchPerPageTimeoutSecs` | `number` | Per-page fetch timeout |
| `webSearchFetchMaxCharsPerSource` | `number` | Max characters extracted per source |
| `webSearchContextTokenLimit` | `number` | Token budget for search context |
| `enabledTools` | `{ webSearch: boolean }` | Which tools are available |
| `modelId` | `string` | Project-specific model selection |
| `temperature` | `number` | Model temperature override |
| `contextLength` | `number` | Context window override |
| `maxTokens` | `number` | Max output tokens override |
| `agentProjectPath` | `string` | Workspace path for agents mode |

---

# projects > 03-architecture

> Source: `docs/projects/03-architecture.md`

# Project Architecture

## Project Activation

1. User selects a project from the project list
2. The project becomes the "active project"
3. Its system prompt is injected into every chat turn as `<veyra_project>`
4. Project-specific settings override global settings

## Context Injection

When a project is active, the system prompt includes:

```xml
<veyra_project>
  <name>Project Name</name>
  <description>Project description</description>
  <kind>Project kind</kind>
  <instructions>Custom system prompt from the project</instructions>
</veyra_project>
```

## Scoped Resources

The following resources can be scoped to a project:
- **Conversations**: Chat threads belong to a project

## Project Tracking

- `lastOpenedAt` timestamp is updated when a project is opened
- Projects are sorted by recency by default
- Active/archived filtering in the store

---

# projects > 04-types

> Source: `docs/projects/04-types.md`

# Projects Key Types

From `src/modules/projects/project-types.ts`:

```typescript
type ProjectKind =
  | "app" | "class" | "client" | "codebase"
  | "creative" | "research" | "general";

type ProjectStatus = "active" | "paused" | "archived";

interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  kind: ProjectKind;
  status: ProjectStatus;
  color: string;
  icon: string;
  systemPrompt: string;
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
}

interface ProjectSettings {
  webSearchEnabled?: boolean;
  webSearchMode?: "auto" | "always" | "off";
  webSearchFetchEnabled?: boolean;
  webSearchFetchCount?: number;
  webSearchPerPageTimeoutSecs?: number;
  webSearchFetchMaxCharsPerSource?: number;
  webSearchContextTokenLimit?: number;
  enabledTools?: {
    webSearch: boolean;
  };
  modelId?: string;
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  agentProjectPath?: string;
}
```

All `ProjectSettings` fields are optional — they override global defaults only when set.

---

# projects > README

> Source: `docs/projects/README.md`

# Projects Module

Persistent local containers that scope chats, tools, and settings.

## Contents

- [01-overview.md](01-overview.md) — Project kinds, statuses, fields
- [02-settings.md](02-settings.md) — Per-project settings overrides
- [03-architecture.md](03-architecture.md) — Activation, context injection, scoped resources
- [04-types.md](04-types.md) — Key type definitions

---

# agents > 01-overview

> Source: `docs/agents/01-overview.md`

# Agents Overview

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

### 3. Session End
- Session status transitions to `completed` or `failed`
- Exit code is recorded
- Events are persisted in the session

### 4. Timeout
Agent runs have a **2-hour timeout**. If the agent doesn't complete within this time, it's automatically stopped.

---

# agents > 02-session-management

> Source: `docs/agents/02-session-management.md`

# Agent session management

## Persistence

Sessions and opened project paths are stored in the existing local agent store. Running sessions are excluded from persistence because their processes cannot survive app restart. Composer drafts stay in memory while the workspace is mounted.

## Scheduling and navigation

The shared AI scheduler queues agent runs, and the store serializes starts. A project with a running session does not start a second run. The composer shows queued/model-preparation state and supports cancellation before the runtime starts.

Switching projects or creating a fresh draft does not stop running work. A selected session restores its project and mode. A fresh session stays empty when project sessions refresh. Queued tasks capture their intended session at dispatch, so subsequent navigation cannot redirect a follow-up or pull the user into another project when work begins.

## Follow-ups

Completed sessions can receive another task. The runtime continues to use ephemeral Pi runs; Veyra supplies a bounded transcript of previous user tasks and agent responses as context for the next task. The recent transcript is capped according to the model context setting and does not create a second on-disk transcript. Tool output and reasoning are not replayed. The agent can inspect files again for current state.

## Operations

| Operation | Description |
|-----------|-------------|
| Open project | Remember a local folder and start a fresh task draft |
| New session | Clear the active session selection without deleting history |
| Run | Create a session or continue the captured selected session |
| Stop | Cancel queued preparation or abort the current project run |
| Delete | Remove a session after confirmation |

---

# agents > 03-events

> Source: `docs/agents/03-events.md`

# Agent Events

Events are streamed from Pi CLI via Tauri events.

## Event Types

| Event | Description |
|-------|-------------|
| `status` | Session status change |
| `reasoning` | AI reasoning/thinking |
| `tool` | Tool execution |
| `output` | Text output |
| `error` | Error occurred |
| `result` | Final result |
| `token_update` | Token usage update |

## Event Channels

- `agent://run-finished` — Run completed
- `agent://run-event` — Live event during execution

## Live Output Merging

- Reasoning deltas are merged incrementally
- Tool events are merged by `toolCallId` to avoid duplicates
- Output streaming displays text as it arrives
- ANSI escape codes are stripped from output

---

# agents > 04-ui

> Source: `docs/agents/04-ui.md`

# Agent workspace

Agents has a dedicated project workspace, entered from the Agents navigation item. It uses a compact app rail and does not show the chat header, chat options, or chat context sidebar.

## Layout

- The left sidebar remembers opened project folders, groups sessions under their project, and searches project names and session titles. Opening a folder creates a fresh session draft. Switching projects preserves running work.
- The center shows the project/session breadcrumb and a work log. Tasks use an inset block; agent responses use plain markdown. Reasoning and tool output are expandable. Auto-scroll follows output until the user scrolls up.
- The bottom composer contains Plan/Build, provider and model selection, reasoning, and Run/Stop. Drafts survive project/session navigation while the workspace remains mounted. Enter runs a task; Shift+Enter adds a line. Escape in the composer cancels queued or running work.
- The optional inspector offers Files and Activity. Files supports folder navigation and read-only text previews. Activity shows session status, mode, context tokens, and expandable tool details.

## Components

| Component | Purpose |
|-----------|---------|
| `agents-panel.tsx` | Project/session navigation, workspace shell, task starters |
| `agent-composer.tsx` | Task drafts, mode controls, scheduler state and cancellation |
| `agent-output-view.tsx` | Streaming work log and expandable activity |
| `agent-chat-turn.tsx` | Task and agent response rendering |
| `agent-inspector.tsx` | Project file browser, text preview and tool activity |
| `agent-workspace.css` | Workspace layout, responsive styles and app rail |
| `typewriter-markdown.tsx` | Streaming markdown rendering |

The inspector reads project files through `inspect_agent_workspace`. Directory listings are limited to 300 entries and text previews to 64 KiB. Canonical paths must remain inside the project, binary files are rejected, and filesystem work runs off the Tauri command thread. The inspector does not edit files or run commands.

---

# agents > 05-tauri-commands

> Source: `docs/agents/05-tauri-commands.md`

# Agents Tauri IPC Commands

| Command | Description |
|---------|-------------|
| `check_pi_available` | Check if Pi CLI is on PATH |
| `stop_pi_agent` | Stop a running agent |
| `run_pi_agent` | Start an agent run (streams events) |
| `inspect_agent_workspace` | List a project directory or read a bounded text preview within the project |
| `inspect_agent_reasoning` | Read exact model/provider reasoning capabilities from the installed Pi registry |

---

# agents > 06-types

> Source: `docs/agents/06-types.md`

# Agents Key Types

From `src/modules/agents/agent-types.ts`:

```typescript
type AgentMode = "plan" | "build";

type AgentRuntimeId = "pi";

type AgentStatus =
  | "idle" | "checking_runtime" | "ready" | "running"
  | "completed" | "failed" | "stopped";

type AgentEventType =
  | "status" | "reasoning" | "tool"
  | "output" | "error" | "result" | "token_update";

interface AgentSession {
  id: string;
  runtime: AgentRuntimeId;
  mode: AgentMode;
  status: AgentStatus;
  projectPath: string;
  prompt: string;
  model: string;
  piSessionId?: string;
  title: string;
  summary?: string;
  startedAt: number;
  endedAt?: number;
  events: AgentEvent[];
  exitCode?: number | null;
  contextTokens?: number;
}

interface AgentEvent {
  id: string;
  type: AgentEventType;
  title: string;
  detail?: string;
  at: number;
  sequence?: number;
  toolCallId?: string;
}

interface PiSession {
  id: string;
  title: string;
  updated: number;
  created: number;
  directory?: string;
}
```

---

# agents > 07-reasoning

> Source: `docs/agents/07-reasoning.md`

# Model-specific agent reasoning

Veyra reads the installed Pi SDK's model registry, including the user's `.pi/agent/models.json`, and uses Pi's `getSupportedThinkingLevels` and `clampThinkingLevel`. No provider requests, auth-file reads, model-name heuristics, or additional SDK installation are needed for the lookup. Registry access uses an in-memory credential store, and the bridge returns only provider/model identity and reasoning capabilities.

The installed SDK inspected during implementation was Pi 0.80.6. Its catalogs already distinguish models with extra-high effort from models with max effort. Pi's `thinkingLevelMap` can set an unsupported level to `null`; this also handles models whose reasoning cannot be turned off.

## Controls and synchronization

- Effort-capable models show only the levels Pi advertises for that exact model.
- Boolean thinking adapters such as Qwen and Together show on/off rather than imply they can apply several effort levels.
- Models without reasoning support show a disabled No reasoning control.
- Compatible endpoints declaring `supportsReasoningEffort: false` without another thinking transport show Model managed.
- Unknown or ambiguous model routes show Reasoning unknown. Veyra does not guess capabilities from a model's name.

Selections are remembered per provider, model, and endpoint. A model switch immediately discards stale capability results. Refresh reloads Pi metadata after a configuration change. Runs recheck the registry and clamp the requested level with Pi's own helper. The CLI receives separate `--provider`, `--model`, and `--thinking` arguments, preserving slash-containing model IDs.

Provider IDs are matched first. A custom provider name can resolve through a unique exact endpoint/model match. A different endpoint or an ambiguous match is rejected instead of silently routing to another provider. Custom endpoints still need to be configured and authenticated in Pi.

LM Studio setup adds missing models to `models.json` while preserving existing providers, models, compatibility options, and thinking mappings. New local models default to unverified reasoning support instead of being marked reasoning-capable because the user selected a level. Configure verified capabilities in Pi before enabling their controls. Reasoning metadata describes what Pi can request; the endpoint remains responsible for honoring it.

Lookup subprocesses are cached in the UI, run off the Tauri command thread, and have a deadline. Stop also cancels startup during capability inspection so a cancelled task cannot subsequently launch the agent.

## References

- [Pi model configuration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md)
- [Pi AI model helpers](https://github.com/earendil-works/pi/blob/main/packages/ai/src/models.ts)
- [Pi RPC integration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md)

The installed version's source and exports take precedence over newer online documentation.

---

# agents > README

> Source: `docs/agents/README.md`

# Agents Module

Optional Pi CLI integration for plan and build modes with streaming event output.

## Contents

- [01-overview.md](01-overview.md) — Modes, session lifecycle, requirements
- [02-session-management.md](02-session-management.md) — Persistence, concurrency, operations
- [03-events.md](03-events.md) — Event types, channels, output merging
- [04-ui.md](04-ui.md) — UI components and panels
- [05-tauri-commands.md](05-tauri-commands.md) — Tauri IPC commands
- [06-types.md](06-types.md) — Key type definitions
- [07-reasoning.md](07-reasoning.md) — Model-specific reasoning controls and Pi routing

---

# connectivity > 01-overview

> Source: `docs/connectivity/01-overview.md`

# Connectivity Module

The connectivity system controls whether Veyra uses internet-dependent features based on user preference and system network status.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/connectivity/connectivity-types.ts` | Type definitions |
| `src/lib/connectivity/connectivity-service.ts` | Connectivity resolution logic |
| `src/lib/connectivity/provider-connectivity.ts` | Provider-specific connectivity checks |
| `src/lib/connectivity/feature-capabilities.ts` | Feature availability based on connectivity |
| `src/lib/connectivity/useConnectivity.ts` | React hook for connectivity state |
| `src/stores/connectivity-store.ts` | Zustand connectivity store |

## Preferences

| Preference | Description |
|------------|-------------|
| `auto` | Detect network status automatically |
| `online` | Force online mode (internet features enabled) |
| `offline` | Force offline mode (privacy mode — no internet features) |

## Effective Connectivity

Resolves user preference against system network status:
- `offline` preference always results in `offline`
- `online` preference always results in `online`  
- `auto` checks actual system network status

## Requirements

| Requirement | Description |
|-------------|-------------|
| `none` | No connectivity needed |
| `local_service` | Requires local service (LM Studio, bundled search engine) |
| `internet` | Requires internet access |

---

# connectivity > 02-types

> Source: `docs/connectivity/02-types.md`

# Connectivity Key Types

```typescript
type ConnectivityPreference = "auto" | "online" | "offline";

type EffectiveConnectivity = "online" | "offline";

type SystemOnlineStatus = boolean | "unknown";

type ConnectivityRequirement = "none" | "local_service" | "internet";
```

---

# connectivity > README

> Source: `docs/connectivity/README.md`

# Connectivity

Controls online/offline behavior and determines which features are available based on network status.

## Contents

- [01-overview.md](01-overview.md) — Connectivity system and preferences
- [02-types.md](02-types.md) — Type definitions

---

# code-execution > 01-overview

> Source: `docs/code-execution/01-overview.md`

# Code Execution

Native host code execution is disabled until Veyra has a real OS-enforced
sandbox. Timeouts, process termination, working-directory selection, and source
filtering are not security boundaries.

Veyra therefore does not register a Tauri command that spawns Python or expose
`code_execution` in provider tool definitions. The legacy tool name remains
recognized so stored or model-emitted calls fail closed with a clear disabled
error.

Persisted code-execution settings are retained for state compatibility, but
they do not enable native execution.

---

# code-execution > README

> Source: `docs/code-execution/README.md`

# Code Execution

Native host code execution is disabled. Veyra does not spawn Python or another
host interpreter without an OS-enforced sandbox.

## Contents

- [01-overview.md](01-overview.md) — Disabled boundary and compatibility behavior

---

# architecture > 01-state-management

> Source: `docs/architecture/01-state-management.md`

# State Management

Cross-cutting architecture patterns for state management.

## Key Files

| File | Purpose |
|------|---------|
| `src/stores/chat-store.ts` | Central conversation state |
| `src/stores/settings-store.ts` | Combined settings (8 slices) |
| `src/stores/provider-store.ts` | Provider and model management |
| `src/stores/connectivity-store.ts` | Connectivity state |
| `src/stores/update-store.ts` | App update state |

## Zustand Stores (8 total)

Stores live in both `src/stores/` and `src/modules/<feature>/`:

| Store Hook | Location | Purpose |
|------------|----------|---------|
| `useChatStore` | `src/stores/chat-store.ts` | Conversations, streaming buffer, messages |
| `useSettingsStore` | `src/stores/settings-store.ts` | All app settings (8 slices) |
| `useProviderStore` | `src/stores/provider-store.ts` | Provider connection, model listing |
| `useConnectivityStore` | `src/stores/connectivity-store.ts` | Online/offline/local-only state |
| `useUpdateStore` | `src/stores/update-store.ts` | App update state |
| `useProjectStore` | `src/modules/projects/project-store.ts` | Projects |
| `useResearchStore` | `src/modules/research/research-store.ts` | Research runs and reports |
| `useAgentStore` | `src/modules/agents/agent-store.ts` | Agent sessions |

## Settings Store (8 Slices)

The settings store is composed from 8 slices in `src/stores/slices/`:

| Slice | File | Purpose |
|-------|------|---------|
| `ui-layout-slice` | `ui-layout-slice.ts` | Active nav, panel collapsed state, visible tool settings |
| `model-slice` | `model-slice.ts` | Default model, temperature, context length |
| `web-search-slice` | `web-search-slice.ts` | Search defaults, parameters, and extraction settings |
| `research-slice` | `research-slice.ts` | Default depth, approval requirements |
| `code-execution-slice` | `code-execution-slice.ts` | Python path, timeout |
| `connectivity-slice` | `connectivity-slice.ts` | Online/offline preference |
| `chat-slice` | `chat-slice.ts` | Workspace mode, context anchoring, enhanced mode |
| `update-slice` | `update-slice.ts` | Auto-check updates, dismissed version |

All settings persist to localStorage under `veyra.settings.v1`.

---

# architecture > 02-ai-scheduler

> Source: `docs/architecture/02-ai-scheduler.md`

# AI Job Scheduler

Central scheduler (`src/lib/ai-scheduler.ts`) manages all AI tasks with priority-based queueing.

## Job Types (7 total)

| Type | Priority | Description |
|------|----------|-------------|
| `user_chat` | 0 (highest) | User chat requests |
| `agent_pi` | 1 | Pi CLI agent runs |
| `research_run` | 1 | Research pipeline execution |
| `auto_name_chat` | 2 | Auto-generate conversation titles |
| `summarize_chat` | 3 | Conversation summarization |
| `compress_context` | 3 | Context compression |
| `maintenance` | 4 (lowest) | Background cleanup |

## Priority Levels

| Level | Category |
|-------|----------|
| 0 | User-facing (highest priority) |
| 1 | Important background tasks |
| 2 | Standard background tasks |
| 3 | Low-priority background tasks |
| 4 | Maintenance (lowest) |

## Behavior

- Jobs are queued and executed in priority order
- User chat always takes priority
- Background jobs run when the scheduler is idle
- Abort support for cancellable jobs

---

# architecture > 03-prompt-construction

> Source: `docs/architecture/03-prompt-construction.md`

# Prompt Construction

Veyra assembles authoritative system instructions separately from retrieved or generated reference context. Each block is conditionally included based on the current state.

```
System message:
Veyra core          — Base AI identity and behavior
<veyra_project>     — Active project context
<veyra_context>     — Date, time, platform

Non-system reference message:
<veyra_conversation_summary>  — Summary of older turns
<veyra_web_search>  — Untrusted web evidence from tool calls
```

Reference material is admitted only when it fits after the system instructions and active conversation. The newest conversation turn is always retained, and older history is included as a contiguous suffix.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/prompts.ts` | Prompt construction and assembly |
| `src/lib/context.ts` | Context budgeting and message assembly |
| `src/modules/chat/chat-context-builder.ts` | Tool-round context assembly |

---

# architecture > 04-provider-system

> Source: `docs/architecture/04-provider-system.md`

# Provider System

## Adapter Interface

The actual interface from `src/lib/providers/types.ts`:

```typescript
interface ProviderAdapter {
  id: string;
  name: string;
  icon: string;
  connectivityRequirement: ProviderConnectivityRequirement;
  capabilities?: { jsonMode?: boolean };
  isAvailable: () => Promise<boolean>;
  fetchModels: () => Promise<ModelInfo[]>;
  sendChat: (options: ProviderChatOptions) => Promise<void>;
  prepareModel?: (modelId: string, options?: ProviderPrepareModelOptions) => Promise<void>;
  unloadAllModels?: () => Promise<void>;
  reconnect?: () => Promise<ProviderConnectResult>;
  startServer?: () => Promise<ProviderConnectResult>;
}
```

## Provider Adapters

LM Studio remains the default local provider. Veyra also supports bring-your-own-key
OpenAI-compatible providers through one shared cloud adapter.

### LM Studio Adapter
Handles:
- Model listing with 5-minute cache
- Streaming responses via `sendChat`
- Model loading/unloading via `prepareModel` / `unloadAllModels`
- Server start/restart via `startServer` / `reconnect`

### Cloud Adapter
Built-in presets cover OpenAI, OpenRouter, NVIDIA NIM, OpenCode Zen, and Groq. Users can add custom HTTPS endpoints (or localhost HTTP endpoints) and manual model IDs.

Handles:
- OpenAI Chat Completions streaming
- Model discovery
- Tool calls
- Cancellation
- Provider authentication
- Compatibility policies

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/providers/types.ts` | Provider type definitions and adapter interface |
| `src/lib/providers/lm-studio-adapter.ts` | LM Studio adapter |
| `src/lib/providers/openai-compatible-adapter.ts` | Cloud provider adapter |
| `src/lib/providers/cloud-config.ts` | Cloud provider presets and configuration |
| `src/lib/providers/index.ts` | Provider adapter registry |

## Security

Cloud API keys are stored in the operating-system credential vault through Tauri and
are excluded from Zustand persistence. Non-secret provider configuration is stored
under `veyra.provider.v1`.

---

# architecture > 05-tool-system

> Source: `docs/architecture/05-tool-system.md`

# Tool System

## Registered Tools

| Tool | Condition | Description |
|------|-----------|-------------|
| `web_search` | `webSearchEnabled` | Search the web via the bundled DonSeTch engine. Up to 2 retries. |
| `scratchpad_write` | `enhancedMode` | Persistent working notes across tool rounds. |
| `ask_question` | `enhancedMode` | Pause execution to ask the user a question. |

Each tool has a JSON schema defining its parameters. Tool calls execute in rounds:
- Standard mode: up to **6 rounds**
- Enhanced mode: up to **10 rounds**

Native `code_execution` is disabled and is not included in provider tool definitions. Legacy calls return a disabled error until an OS-enforced sandbox exists.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/tool-registry.ts` | Tool definitions for LLM (JSON Schema) |
| `src/lib/tool-call-ui.ts` | UI rendering for tool calls |
| `src/modules/chat/chat-tool-rounds.ts` | Tool call execution engine |
| `src/modules/chat/chat-tool-loop.ts` | Tool loop iteration control |
| `src/modules/chat/tools/` | Individual tool implementations |

---

# architecture > 06-encrypted-storage

> Source: `docs/architecture/06-encrypted-storage.md`

# Encrypted Storage

## Conversation Encryption

- AES-GCM encryption with authenticated snapshot revisions
- Encryption keys stored in the operating-system credential vault
- Web Workers handle encryption/decryption without blocking the UI
- Debounced saves (500ms) to avoid excessive I/O
- Atomic primary writes with one rotating backup
- Emergency browser storage is revision-compared rather than blindly preferred

## Key Management

- The OS credential vault is the only source of truth for new keys
- Legacy `conversation.key` files are migrated into the vault and removed
- Legacy deterministic-key snapshots remain decryptable only for migration
- If no copy can be decrypted, writes are blocked to preserve recovery data

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/conversation-storage.ts` | Encrypted conversation persistence |

---

# architecture > 07-backend

> Source: `docs/architecture/07-backend.md`

# Tauri Backend

## Rust Modules (9 total)

| Module | Purpose |
|--------|---------|
| `agents/` | Pi CLI integration |
| `app_update` | Application auto-update download, validation, installer launch |
| `connectivity/` | Network connectivity probe |
| `extensions/` | MCP server discovery and invocation |
| `file_extraction/` | PDF, DOCX, PPTX, XLSX extraction |
| `projects/` | Project CRUD, manifest export |
| `research/` | Research run, step, source, evidence, claim, contradiction, report CRUD |
| `shared/` | SQLite connection, migrations, encryption keys |
| `web_search/` | Bundled engine lifecycle, MCP bridge, page fetching |

## Command Count

**~61 Tauri commands** registered across all modules. Key counts:
- Agents: 3 commands
- App update: 1 command
- Connectivity: 1 command
- Web search: 14 commands
- Projects: 5 commands
- Research: 15 commands
- Extensions: 14 commands
- File extraction: 1 command
- Core (conversations, credentials, app lifecycle): 8 commands

## Storage

- SQLite database for structured data
- JSON files for conversations (encrypted)
- localStorage for settings and agent sessions

## App Lifecycle

### Startup (`src/lib/startup.ts`)
1. Initialize Tauri IPC
2. Load settings from localStorage
3. Connect to LM Studio
4. Load projects
5. Check Pi CLI availability
6. Initialize web search (start the bundled engine)

### Shutdown (`src/lib/app-shutdown.ts`)
1. Unload all AI models
2. Interrupt running research
3. Flush pending saves
4. Close SQLite connections

## Key Files

| File | Purpose |
|------|---------|
| `src-tauri/src/lib.rs` | Tauri application setup and command registration |
| `src/lib/startup.ts` | App initialization sequence |
| `src/lib/app-shutdown.ts` | Graceful shutdown |
| `src/lib/app-update.ts` | Update checking |

---

# architecture > 08-context-window

> Source: `docs/architecture/08-context-window.md`

# Context Window Management

## Token Estimation

Uses a **4-chars-per-token heuristic** — simple but effective for trimming decisions.

## Message Trimming

Messages are trimmed to fit within the token budget:

```
token_budget = context_limit - reserved_output_tokens
```

Messages are removed oldest-first until the budget is satisfied.

## Context Stats

The UI displays:
- Estimated tokens used
- Percentage of context window used
- Number of included/dropped messages

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/context.ts` | Context window estimation |
| `src/lib/context-breakdown.ts` | Context usage breakdown |
| `src/lib/context-panel-options.ts` | Context panel UI options |

---

# architecture > README

> Source: `docs/architecture/README.md`

# Architecture

Cross-cutting patterns, state management, provider system, and backend design.

## Contents

- [01-state-management.md](01-state-management.md) — Zustand stores and settings slices
- [02-ai-scheduler.md](02-ai-scheduler.md) — AI job scheduling and priorities
- [03-prompt-construction.md](03-prompt-construction.md) — System prompt XML block assembly
- [04-provider-system.md](04-provider-system.md) — LM Studio and cloud provider adapters
- [05-tool-system.md](05-tool-system.md) — Tool definitions and execution
- [06-encrypted-storage.md](06-encrypted-storage.md) — AES-GCM conversation encryption
- [07-backend.md](07-backend.md) — Tauri Rust modules, startup and shutdown
- [08-context-window.md](08-context-window.md) — Token estimation and message trimming

