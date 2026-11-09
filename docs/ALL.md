# Veyra — Complete Documentation
> Auto-generated from docs/INDEX.md by scripts/combine-docs.mjs
> Generated: 2026-11-09T03:37:12.542Z
> Total files: 55

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
  - [07-artifacts](#chat-07-artifacts)
  - [08-reasoning-levels](#chat-08-reasoning-levels)
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
- [permissions](#permissions)
  - [README](#permissions-readme)
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

Every chat turn runs on the bundled Pi runtime. Veyra no longer ships an
in-browser chat orchestrator: the frontend prepares one job, the Rust side owns
the process, and the transcript is rebuilt from Pi events.

## Key Files

| File | Purpose |
|------|---------|
| `src/hooks/use-chat-send.ts` | Builds the `agent_pi` job (prompt, model, reasoning, attachments) |
| `src/hooks/use-chat-pipeline.ts` | Wires provider/model settings into send and new-chat handlers |
| `src/modules/agents/agent-store.ts` | Session lifecycle, event log, steering, stop |
| `src/modules/agents/pi-runtime.ts` | Frontend bridge to the Pi commands (run/stop/steer/check) |
| `src-tauri/src/agents/pi_runner.rs` | Spawns Pi, streams stdout as events |
| `src/modules/agents/agent-chat-turns.ts` | Pure projection of the event log into renderable turns |
| `src/modules/agents/pi-conversation-storage.ts` | Mirrors sessions into the conversation index and snapshot |
| `src/modules/chat/chat-types.ts` | Shared chat/session/UI types |

## Turn Flow

1. `Composer` calls `handleSend` from `useChatSend`.
2. `useChatSend` filters attachments, resolves the model's system prompt,
   reasoning level, and context budget, then enqueues one `agent_pi` job in
   `aiScheduler` (one job per workspace path).
3. Inside the job, LM Studio models are loaded first when needed, then
   `agent-store.startSession` composes the prompt (memory + previous transcript
   under one budget), picks the project scope, and dispatches `runPiAgent`.
4. Pi emits progress; `agent-store` appends `AgentEvent`s to the session.
5. `buildAgentChatTurns` folds those events into user/assistant/tool/reasoning
   turns for `AgentChatTurn`; `AgentActivityCard` renders tool and reasoning
   steps, `MessageBubble` renders prose, and artifacts and interactive answers
   render through their own blocks.
6. On completion, `pi-conversation-storage` mirrors the session into the
   conversation index and writes the encrypted snapshot, and memory extraction
   is queued when background jobs are enabled.

## Stop, Steer, Retry

| Action | Behavior |
|--------|----------|
| Stop | `Composer` `onStop` cancels the queued/active job and calls `stopSession`, which aborts the controller and kills the Pi process |
| Steer | A running session accepts follow-up text through `steerSession` |
| Follow-up | Sending while a session is live continues that session (`continueSessionId`) |

## Ownership Rules

- `agent-store.sessions` is the transcript. Nothing else stores a second copy.
- `chat-store` is an index over that transcript (title, project scope, artifact
  text edits, hydration state). It never constructs messages on its own.
- A conversation belongs to at most one project, and a project's workspace
  directory is mirrored into `settings.agentProjectPath` so path-keyed sessions
  can resolve back to a project for memory and skill scoping.

---

# chat > 02-tools

> Source: `docs/chat/02-tools.md`

# Chat Tools

Pi asks Veyra to run a tool. The frontend holds the tool definitions and does
the execution, so no tool code runs inside the Pi process.

## Registered Tools

| Tool | Condition | Description |
|------|-----------|-------------|
| `web_search` | web search enabled **and** connectivity is online | Runs the bundled search orchestrator and returns a context block |
| `ask_question` | interactive answers enabled | Asks the user one or more questions and returns their answers |
| `create_artifact` | artifacts enabled | Attaches an HTML, code, or document artifact to the conversation |
| `generate_interactive_answer` | interactive answers enabled | Attaches a live UI page: the model writes an OpenUI Lang program that Veyra renders with its own component library |
| `mcp_*` | server connected, chat-enabled, grant present | Proxied MCP tool calls, capped at 60 KB of output |

`scratchpad_write` is filtered out of the Pi tool list. Code execution is passed
as `codeExecutionEnabled: false`, so `run-python` is never offered to the model.

## How Tools Reach Pi

`src/modules/agents/pi-chat-tools.ts` builds the tool list with
`buildProviderTools` (plus `buildMcpProviderTools`) and hands it to the Pi
runner. Pi's tool request arrives as a prompt whose title is `veyra_tool` and
whose placeholder is the JSON tool call:

1. Re-validate that the tool is still enabled in the current scope.
2. Dispatch by name (`web_search`, `ask_question`, artifacts, MCP).
3. Return the result as text, or a `Tool failed: …` string the model can react to.
4. Emit an `AgentEvent` for artifacts and interactive answers so the turn renders them.

## Interactive Answers

`generate_interactive_answer` takes one `program` string: an
[OpenUI Lang](https://www.openui.com) document the model writes with the
component library in `src/modules/chat/ui/`. The program is not a template — it
arranges primitives (`Col`, `Row`, `Card`, `Chart`, `Table`, `Slider`, `Svg`, …),
holds its own state in `$variables`, and computes what it shows with `@`
functions, so the answer keeps working without another message.

- `src/modules/chat/ui/library.ts` registers the components, functions and
  actions, and compiles them into the system prompt (`getInteractiveAnswerPrompt`).
  `src/lib/prompts.ts` appends that prompt only when the tool is enabled.
- `src/modules/chat/ui/validate.ts` parses the program before it is stored.
  Unknown components, undefined references, unreferenced statements and
  truncated output are rejected, and the reason goes back to the model as a
  tool error so it can repair the program.
- `src/modules/chat/interactive-answer.ts` normalizes the payload
  (`{ version: 2, id, title?, program }`) and size-checks it.
- `src/modules/chat/components/interactive-answer-block.tsx` renders it with
  `<Renderer>` and routes actions: `@ToAssistant` becomes a follow-up message
  (with form values), `@OpenUrl` opens the system browser, `@CopyToClipboard`
  copies, and `@Set` / `@Reset` are applied by the renderer itself.

The prompt is about 7.5k tokens. Local models need a context window large
enough for it (LM Studio defaults to 4k, which truncates the prompt and breaks
the output); raise the model's context length before enabling the feature.

## Permissions

- Project policy can disable a capability id outright.
- MCP calls need a `CapabilityGrant` scoped to server, project, chat, and the
  server's capability fingerprint. Destructive tools consume a one-time grant.
- A missing grant fails the call with instructions instead of prompting silently.

## Rendering

Tool activity is rendered from the session event log: `AgentActivityCard` for
`tool` events, `ArtifactBlock` and `InteractiveAnswerBlock` for rich output. The
previous per-message `toolStates` renderer was removed with the orchestrator.

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

Streaming is event-shaped, not token-shaped. The Pi process writes lines on
stdout, `pi_runner.rs` forwards them, and `agent-store` appends one `AgentEvent`
per line. The UI renders whatever the event log currently contains.

## Stream Types

| Type | Rendered by | Description |
|------|-------------|-------------|
| `output` (Pi / Pi stream) | `MessageBubble` via `TypewriterMarkdown` | Assistant prose, appended to the current turn |
| `reasoning` | `ReasoningBlock` | Chain-of-thought, collapsible, collapsed once complete |
| `tool` | `AgentActivityCard` | Tool name, arguments, and result summary |
| `status` | `AgentChatTurn` | Prompt echo, session started/stopped, failures |
| `error` | `AgentChatTurn` | Error card with the failing command or provider message |

Artifacts and interactive answers arrive as their own events and are rendered by
`ArtifactBlock` / `InteractiveAnswerBlock` on the owning turn.

## Why There Is No Message Buffer

The previous architecture accumulated tokens in `chat-store.streamingBuffer` and
committed them at the end of a turn. That path was removed with the orchestrator:
tokens already arrive as complete event payloads, so buffering would duplicate
the transcript and force a second merge step. The event log is the single source
of truth and is persisted as-is.

## Stop / Cancel

Pressing **Escape** (or the stop button) while `busy` cancels the scheduled job
and calls `agent-store.stopSession`, which aborts the request controller and
terminates the Pi process. The session is marked `stopped` and its events remain
readable.

The composer's primary button follows `resolveComposerAction`
(`src/modules/chat/composer-action.ts`). While a response runs it stays a Send
button when there is text to steer with, and becomes a square **Stop** button
when the composer is empty, so an empty draft never leaves the run uncancellable.

## Scroll Behavior

`AgentOutputView` follows the tail while the user is within 100px of the bottom,
and stops following as soon as they scroll up, so streaming never fights a user
reading earlier turns.

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

const CHAT_MODE_NAV_IDS = ["chat", "projects"] as const;

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
  artifact?: Artifact;
  modelId?: string;
}

type ArtifactFormat = "html" | "code" | "document";

type Artifact = {
  id: string;
  format: ArtifactFormat;
  title: string;
  content: string;
  language?: string;
  filename?: string;
  createdAt: number;
};
```

Artifact rendering, validation, and document editing are described in [07-artifacts.md](07-artifacts.md).

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

# chat > 07-artifacts

> Source: `docs/chat/07-artifacts.md`

# Chat Artifacts

Artifacts are finished outputs attached to an assistant message. The `create_artifact` tool supports three formats:

| Format | Content and use |
| --- | --- |
| `html` | Self-contained visual pages, diagrams, comparisons, timelines, reports, and print layouts. |
| `document` | Markdown deliverables with a simple title and text editor. |
| `code` | Downloadable source and configuration files; artifact creation does not execute them. |

Chat remains the default for explanations and advice. The model creates an artifact for an explicit deliverable request or when a visual output materially improves the answer. Each assistant message can own at most one artifact. The Artifacts switch is in Chat settings and is enabled by default.

## Viewer

The message attachment shows its title, format, and size. It supports collapse, full-screen viewing, source copy, and format-aware download. HTML artifacts have Preview and Source views and a print action. Documents render Markdown and can be edited with a basic title field and Markdown textarea; saving replaces the message-owned document content without a revision history or advanced editing tools.

HTML and code source are displayed as text or inside a sandboxed preview. Code files are downloaded and never run. Documents download as Markdown by default. Explicit filenames are accepted only as a single basename, without folder paths.

## Validation and context

- Artifact content is limited to 256 KiB in UTF-8 bytes. Oversized content is rejected without truncation.
- The UI and tool host generate the artifact id and timestamp.
- Regeneration keeps the previous artifact message until a new artifact saves successfully; failed or cancelled generation leaves the previous output available.
- Tool state and the tool result keep only the title, format, and status. The complete artifact is saved on its assistant message and removed from prior-message provider history.
- Conversation persistence stores artifacts with the owning conversation snapshot.

## HTML preview boundary

In Tauri, the frontend registers an HTML artifact with a Rust in-memory preview store. The store accepts UUID-shaped ids, limits content to 256 KiB, holds at most 32 previews, and expires entries after 24 hours. It serves only a matching `GET` preview request. No artifact files are written for previewing.

The preview response sets a restrictive CSP: inline CSS/SVG and inline scripts are allowed, while network connections, external images/fonts/media, forms, nested frames, workers, and embedded objects are blocked. The iframe uses `sandbox="allow-scripts"` without `allow-same-origin`, and the application CSP permits frames only from the artifact preview scheme. This keeps artifact code in an opaque origin without the app's same-origin Tauri IPC access. The CSP and iframe sandbox are applied together.

## Key files

| File | Purpose |
| --- | --- |
| `src/modules/chat/artifact.ts` | Artifact format, size validation, metadata, and download filename rules. |
| `src/modules/agents/pi-chat-tools.ts` | Validates and attaches the `create_artifact` tool result. |
| `src/modules/chat/components/artifact-block.tsx` | Message viewer, HTML preview, document editor, copy, download, and print controls. |
| `src-tauri/src/artifact_preview.rs` | Bounded in-memory preview protocol and response security headers. |

---

# chat > 08-reasoning-levels

> Source: `docs/chat/08-reasoning-levels.md`

# Chat Reasoning Levels

The composer's reasoning control selects how much thinking the active model may spend. The options are not guessed from a model name: each one comes from a source that knows the model.

## Sources, in priority order

| Source | Applies to | Notes |
|--------|------------|-------|
| LM Studio `/api/v1/models` | `lm-studio` models | Authoritative for normal chat, which talks to the endpoint directly. Read from `capabilities.reasoning.allowed_options`. |
| Pi model registry | Every other provider, and local models without a published configuration | Uses `getSupportedThinkingLevels` and `clampThinkingLevel` from the installed Pi SDK. See [agents/07-reasoning](../agents/07-reasoning.md). |

Normal chat bypasses Pi, so an endpoint that publishes its own reasoning options must win over Pi's registry. Otherwise a model could offer levels the request cannot use.

## Controls

The composer keeps a compact pill showing the current level. Clicking it opens a popover with a discrete slider whose stops are the model's advertised levels, plus the active level name, a chevron that expands the full option list, a capability note, and Refresh. The slider and list write the same setting, so either path is one change. The popover is portaled above the composer so it is never clipped by the input container.

- **Effort models** advertise several levels and get a slider limited to those levels.
- **Boolean models** advertise `off`/`on` in LM Studio, or a `thinkingFormat` transport in Pi, and get a switch instead of a slider inside the popover.
- **Mandatory reasoning** models do not expose `off`; the switch is replaced by a fixed label.
- **Model managed** endpoints configure reasoning themselves, so the pill is disabled.
- **Unknown** endpoints publish nothing. Veyra sends no reasoning field rather than guessing.

## Request mapping

LM Studio rejects a reasoning setting the model does not advertise, so a requested level is clamped to the closest advertised one before the request is built.

- Native `/api/v1/chat` uses a single `reasoning` field (`off`, `on`, `low`, `medium`, `high`).
- OpenAI-compatible `/v1/chat/completions` — used when tools are active — uses `reasoning_effort`, where disabled reasoning is spelled `none` and there is no `on` value.
- When no options are known, no field is sent and the endpoint applies its own default.

Selections are remembered per provider, model, and endpoint. Switching models discards stale results, and Refresh re-reads both the endpoint and the Pi registry.

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
- [07-artifacts.md](07-artifacts.md) — Message-owned HTML, code, and editable document artifacts
- [08-reasoning-levels.md](08-reasoning-levels.md) — How the composer's reasoning control resolves model capabilities

---

# hooks > 01-overview

> Source: `docs/hooks/01-overview.md`

# Hooks

React hooks used across Veyra's frontend.

## Chat Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useChatSend` | `src/hooks/use-chat-send.ts` | Builds the `agent_pi` job: prompt, model, reasoning, attachments, LM Studio model load |
| `useChatPipeline` | `src/hooks/use-chat-pipeline.ts` | Provider/model selection plus `handleSend`, `handleNewChat`, `handleDeleteChat` |
| `useChatAttachments` | `src/hooks/use-chat-attachments.ts` | Attachment filtering and validation |
| `useChatContextPanel` | `src/hooks/use-chat-context-panel.ts` | Resolved context length, reserved output tokens, context stats |
| `useModelReasoning` | `src/hooks/use-model-reasoning.ts` | Reasoning levels the selected model actually accepts |

## Agent Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useAgentDispatch` | `src/hooks/use-agent-dispatch.ts` | Session list, active session, runtime check, workspace sessions |

## Scheduler Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useAiScheduler` | `src/hooks/use-ai-scheduler.ts` | Subscribe to scheduler snapshots |

## UI Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useClickOutside` | `src/hooks/use-click-outside.ts` | Click-outside detection |
| `useShutdownState` | `src/hooks/use-shutdown-state.ts` | Shutdown overlay state |
| `useAppUpdateCheck` | `src/hooks/use-app-update-check.ts` | Update check on startup |

Editing, regeneration, forking, and message-level streaming hooks were removed
with the in-browser chat orchestrator. Those actions are now session operations
(`stopSession`, `steerSession`, continue-session sends) exposed by
`agent-store`.

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
| `src/modules/extensions/components/mcp-server-settings.tsx` | Per-chat server enable/disable and project policy controls |

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

MCP servers are off by default for each chat. The user must explicitly enable a server in the chat options menu (`ChatExtensionsSettings`) before the model can call its tools.

---

# extensions > 02-skills

> Source: `docs/extensions/02-skills.md`

# Skills

A Skill is a reusable Markdown instruction set the user can apply to a request. A Skill tells the AI
how to approach a task. It never runs code, changes permissions, or activates itself.

Skills follow the [Agent Skills](https://agentskills.io/specification) shape: a directory containing
`SKILL.md` with `name` and `description` frontmatter, followed by instructions. A Veyra-specific
manifest is not required.

## The model

Three fields carry all the meaning:

| Field | Purpose |
|---|---|
| `name` | Display name and the `/<slug>` identifier in the composer |
| `description` | When the AI should use the Skill — this is the routing signal |
| `instructions` | The Markdown body the model follows |

`id` and `contentHash` are internal. The ID is stable across edits so an existing chat keeps working;
the hash changes whenever the content does, which is what makes a request's record verifiable.

Workflows and capability declarations from older manifests are optional legacies, not part of a Skill
anymore. Imports keep them as `legacyWorkflows` so each one can be converted into a standalone Skill
or dropped.

## Where a Skill runs

Veyra decides which Skills a request uses, then sends their instructions with that request:

1. The library stores the Skill and its content hash.
2. On send, the request's Skills are resolved and snapshotted onto the user message
   (`SkillInvocation[]` on the event and on the saved `ChatMessage`).
3. `materialize_pi_skills` writes each Skill to
   `<app data>/extensions/pi-skills/<slug>/SKILL.md`, copying supporting files from the imported
   package snapshot.
4. Those directories are passed to Pi as `--skill` paths, so Pi resolves supporting files through its
   own `read` tool.
5. The recorded instructions are included in the request prompt inside a `<skill>` block. Veyra sends
   the snapshot rather than letting Pi re-read the file, so the instructions that run are always the
   ones recorded with the request, even after an edit.

Materialized folders carry `disable-model-invocation: true`. Pi will not advertise or auto-load them;
Veyra is the only thing that selects a Skill. Model selection happens through Veyra's own `use_skill`
tool instead, so the catalogue, the access rules, and the record stay in one place. This is what keeps
automatic selection an explicit, user-controlled feature rather than an accident of Pi's discovery.

## Invoking a Skill

- **One message:** type `/` in the composer, pick a Skill. It appears as a chip marked
  "This message", keeps any text already typed, and clears after sending.
- **Whole chat:** use **Pin** on that chip, or the Chat settings panel, to promote it. Pinned Skills
  get a distinct chip and stay until removed.
- Invoking a Skill once never changes the rest of the chat.

## Who can apply a Skill

Two separate questions, with separate controls:

| | Question | Control |
|---|---|---|
| Manual use | Can the user apply this Skill? | The Skill is enabled |
| Model use | May the model load this Skill on its own? | Library default plus a per-Skill override |

**Manual use is always available for an enabled Skill.** The model controls never restrict the user.

For model use there is one library-wide default, **Let the model choose Skills**, and each Skill can
override it in either direction:

| Skill setting | Default off | Default on |
|---|---|---|
| `auto` (Model may use) | model can load it | model can load it |
| `manual` (Manual only) | model cannot load it | model cannot load it |
| unset (follows default) | model cannot load it | model can load it |

The default starts **off**, so installing a Skill never starts steering the chat. The usual setup is
to turn the default on and set the few Skills you want to keep for yourself to Manual only.

When the model may use a Skill, its name and description appear in the prompt as an
`<available_skills>` catalogue and a `use_skill` tool is registered. The model asks for the Skill by
slug and receives the instructions then. Bodies stay out of the prompt until they are needed, and the
composer picker marks such Skills with a small `model` badge.

Access is re-checked when the model asks for a Skill, so disabling a Skill or switching it to manual
mid-request takes effect immediately. A loaded Skill gets the same framing as one the user applied,
including the note that it cannot override Veyra policy or tool permissions.

## Library operations

Create, edit, duplicate, delete, import, and export live in **Settings → Skills**. The editor is a
Markdown textarea plus the name and description. Generated Skills use the same `SKILL.md` format.

Imports accept a folder or ZIP containing `SKILL.md`. A ZIP that wraps everything in one folder is
unwrapped automatically. Exports write `<slug>/SKILL.md` plus supporting files as a portable ZIP.

## Records and retry

A request's record holds each Skill's ID, content hash, and the instruction snapshot. Editing or
deleting a Skill never changes it. **Retry** on a user turn replays the stored record rather than
current library content, so it repeats the original instructions. A request that used no Skill retries
with none.

## Migration

Older builds stored Skills inside the `veyra.extensions.v1` key with `workflows`,
`requestedCapabilities`, and a single per-chat `activeSkillIds` entry.

- Installed instructions are preserved, including disabled state.
- Each old chat selection becomes an explicit chat-scoped Skill, which is the new model's equivalent.
- Workflows and capability lists move to `legacyWorkflows` and `legacyCapabilities`.
- The MCP store parks the old payload under `veyra.skills.legacy.v1` before rewriting its own key;
  `importLegacySkillsOnce()` merges it into the library once at startup and never overwrites a
  selection the user made after upgrading.

## Key files

| File | Purpose |
|---|---|
| `src/modules/extensions/skill-runtime.ts` | Parsing, validation, hashing, request prompt blocks |
| `src/modules/extensions/skills-store.ts` | Library state and the two selection scopes |
| `src/modules/extensions/skills-migration.ts` | Legacy payload conversion |
| `src/modules/extensions/components/skill-editor.tsx` | Markdown editor and `SKILL.md` preview |
| `src/modules/extensions/components/skill-chip.tsx` | Composer chips and the Pin action |
| `src/components/settings/skills-library-settings.tsx` | Settings → Skills |
| `src-tauri/src/extensions/commands.rs` | Snapshot, materialize, and export commands |

## Verification

`src/modules/extensions/skill-runtime.test.ts`, `skills-store.test.ts`, and `skills-migration.test.ts`
cover the format, validation, duplicate names, selection scopes, and legacy conversion.
`src/__tests__/agents/agent-skill-invocation.test.ts` covers what reaches Pi, the one-request versus
persistent split, and retry after edit or deletion.

## Not in this version

Nothing further is planned for Skill selection beyond the controls above; the library default plus a
per-Skill override covers "let the model choose everything" and "keep these few for me".

---

# extensions > 03-chat-integration

> Source: `docs/extensions/03-chat-integration.md`

# Chat Integration

Extensions integrate into the chat pipeline at three points: tool registration, tool execution, and context injection.

## Tool Registration

In `src/modules/agents/pi-chat-tools.ts`, `createPiChatTools()` appends MCP tools to the provider's tool list:

```typescript
buildMcpProviderTools(extensions.mcpServers, projectId, featureFlags, disabledServerIds)
```

Each MCP tool is namespaced as `mcp_<serverId>_<toolName>` to avoid collisions. The tool description is prefixed with `[MCP: <server name>]`.

## Tool Execution

Pi tool requests are handled by `src/modules/agents/pi-chat-tools.ts`, which routes any `mcp_` tool through the MCP adapter:

1. **Resolve** — Match the tool name to an `McpServerRecord` and tool name.
2. **Gate** — Check chat-level enable, server health, project scope, and transport feature flags.
3. **Permission** — Require a `CapabilityGrant` via `findCapabilityGrant`. Destructive tools always need a fresh one-time approval.
4. **Invoke** — Call `invokeMcpTool` which dispatches to the appropriate Tauri command.
5. **Format** — Cap output at 60 KB to prevent context flooding.

Tool call results are rendered in the chat UI's tool call indicators, with `mcpApproval` metadata for permission requests.

## Skill Context Injection

`src/modules/agents/agent-store.ts` resolves a request's Skills when it starts a
session:

```typescript
const invocations = invocationsFor(skills, chatSkillIds, pendingTurnSkillIds);
const contextualPrompt = [projectGuidance, buildSkillPromptBlock(invocations), catalogue, userPrompt]
  .filter(Boolean).join("\n\n");
```

The recorded instructions are sent with the user prompt (after project guidance),
so the block that runs belongs to that request rather than to whatever the
library holds now. See [Skills](02-skills.md) for the materialize step that gives
Pi a resolvable directory for supporting files.

## Model-Selected Skills

Skills the model is allowed to choose are advertised by name and description in an
`<available_skills>` block, and `createPiChatTools` registers a `use_skill` tool.
The model calls it with a slug and gets the instructions back as tool output.

`loadableSkills()` is the single gate: Skills must be enabled, allowed in the
project, and model-invocable under the library default and any per-Skill override.
The handler re-checks access on every call so a mid-request change takes effect.
A loaded Skill is appended to the request's record, so it shows in the transcript
and replays on retry.

## UI Components

| Component | Location | Role |
|-----------|----------|------|
| `ChatExtensionsSettings` | Chat options menu | Pin or remove Skills for the whole chat, and enable/disable MCP servers |
| `SkillsLibrarySettings` | Settings → Skills | Create, edit, duplicate, delete, import, and export Skills |
| `McpServerSettings` | Settings → Extensions | Add, inspect, connect, and grant MCP permissions |

## Data Flow

```
Settings page
  ├─ Skills → skills-store (library, persisted)
  ├─ Add MCP server → Tauri discovery command → extensions-store
  └─ Grant permissions → extensions-store

Composer
  ├─ Type / → picker → skills-store pendingTurnSkillIds (one message)
  └─ Pin a chip → skills-store chatSkillIds (whole chat)

Chat options menu
  └─ ChatExtensionsSettings → chatSkillIds / chatDisabledMcpServerIds

Send message
  └─ useChatSend → agent-store startSession

Agent start
  ├─ invocationsFor → recorded on the user event
  ├─ materialize_pi_skills → --skill paths + file locations
  ├─ buildSkillPromptBlock → recorded instructions in the prompt
  ├─ buildSkillCataloguePrompt → model-invocable Skills by name + description
  └─ buildMcpProviderTools → tool definitions

Model loads a Skill
  ├─ use_skill → loadableSkills gate → instructions returned as tool output
  └─ appended to the request record → chip + retry replay

Retry on a user turn
  └─ agent-store retryRequest → replays the stored invocation record

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
/** A legacy manifest workflow. Kept only so it can be converted. */
type SkillWorkflow = { id: string; name: string; instructions: string };

type SkillRecord = ExtensionRecord & {
  type: "skill";
  /** Instruction body only; frontmatter is generated from name/description. */
  instructions: string;
  contentHash: string;
  /** Spec-compliant folder name used when the Skill is written as SKILL.md. */
  slug: string;
  /**
   * Whether the model may load this Skill on its own.
   * `undefined` inherits the library default; `true`/`false` override it.
   * Manual use by the user is unaffected.
   */
  modelInvocable?: boolean;
  metadata?: Record<string, string>;
  files?: string[];
  snapshotId?: string;
  legacyWorkflows?: SkillWorkflow[];
  legacyCapabilities?: string[];
};

/** The immutable record of a Skill applied to one request. */
type SkillInvocation = {
  id: string;
  name: string;
  slug: string;
  contentHash: string;
  instructions: string;
  scope: "turn" | "chat";
  location?: string;
};

type SkillDraft = {
  name: string;
  description: string;
  instructions: string;
  provenance?: "local" | "generated";
  files?: string[];
  snapshotId?: string;
  metadata?: Record<string, string>;
  legacyWorkflows?: SkillWorkflow[];
  legacyCapabilities?: string[];
};

type SkillValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  name?: string;
  description?: string;
  instructions?: string;
  metadata?: Record<string, string>;
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

Skills live in their own store because they are edited as documents and selected
per request, which is a different lifecycle from a long-lived server process.

```typescript
type SkillsStore = {
  skills: SkillRecord[];
  /** Persistent for the chat, shown as removable chips. */
  chatSkillIds: Record<string, string[]>;
  /** Applies to the next request only; cleared when it is sent. */
  pendingTurnSkillIds: Record<string, string[]>;
  skillsEnabled: boolean;
  /** Library-wide default for model invocation; per-Skill values override it. */
  modelInvocationDefault: boolean;
};

type ExtensionsStore = {
  featureFlags: { mcp: boolean; stdio: boolean; streamableHttp: boolean };
  mcpServers: McpServerRecord[];
  grants: CapabilityGrant[];
  diagnostics: ExtensionDiagnostic[];
  policies: Record<string, ProjectExtensionPolicy>;
  chatDisabledMcpServerIds: Record<string, string[]>;
  chatEnabledMcpServerIds: Record<string, string[]>;
};
```

## Request Records

`SkillInvocation` is stored on the user event (`AgentEvent.skillInvocations`) and
on the saved `ChatMessage`. It holds the ID, content hash, and instruction
snapshot, so editing or deleting a Skill cannot change what a past request ran and
Retry can repeat the original instructions. `ChatMessage.skillSnapshot` is gone;
it recorded only an ID and version, which no longer identifies the content.

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
- [02-skills.md](02-skills.md) — Skill model, library, invocation, records, and migration
- [03-chat-integration.md](03-chat-integration.md) — MCP tools and Skill instructions in chat
- [04-types.md](04-types.md) — Key type definitions

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

`npm run dev:app` and `npm run build:app` call `fetch-search-engine.mjs` automatically. It downloads the pinned `donsetch-win32-x64.tar.gz` (or the asset for the current platform), verifies the published SHA256, builds the adaptive-recall patch, and fetches the 23 MB rerank model from Hugging Face. The first patched build needs Git, Rust, CMake, NASM, a C++ toolchain and libclang; subsequent launches reuse the verified binary. Build details and regression tests are in [scripts/search-engine/README.md](../../scripts/search-engine/README.md).

The artifact is intentionally ignored by git. Run `node scripts/fetch-search-engine.mjs` after cloning if you are not using the npm scripts.

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

DonSeTch and Veyra's adaptive-recall patch are AGPL-3.0-only. The fetch script bundles `LICENSE`, `SOURCE-OFFER.txt`, `adaptive-recall.patch`, complete patched `SOURCE.tar.gz`, and `VEYRA-BUILD.json` with the executable. Keep them in the installer so recipients receive the corresponding source. Veyra runs the engine as a separate process.

---

# web-search > 02-search-flow

> Source: `docs/web-search/02-search-flow.md`

# Web Search Flow

## One query, intent-aware

`SearchOrchestrator.runSearch()` sends a single query to the bundled DonSeTch engine. Veyra's previous multi-query expansion, RRF fusion, and adaptive fallback pipeline has been removed; DonSeTch performs its own multi-engine consensus, semantic reranking, and authority placement internally.

The model can supply an explicit `intent`, or omit it and let the engine infer one.

The bundled engine cancels pending automatic follow-up queries once all primary search lanes finish with enough relevant results and recognized official sources. Weak or incomplete results retain concurrent follow-up searches. This reduces waits behind repeated-engine pacing without changing result limits, semantic ranking, page fetching, or speed presets.

Veyra maps its intent names to DonSeTch intents:

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

When the Advanced Search Bundle is enabled, ArXiv and Wikipedia direct APIs run in parallel with DonSeTch and are merged by URL. Chat narrows the choice further by query intent (ArXiv for academic, Wikipedia for overview questions).

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
- is selected by the orchestrator based on settings and query intent

## DonSeTch provider

`DonSeTchProvider` calls the Rust `web_search` command, which talks to the bundled engine over authenticated loopback MCP. The Rust supervisor owns:

- process start/stop and crash handling
- ephemeral port + bearer token
- rerank model seeding
- MCP session and result mapping

`DonSeTchProvider` only normalizes results: it strips tracking parameters, removes duplicate URLs, drops obvious spam domains, and maps `published_at` into `publishedAt`.

The engine returns ranked URLs, titles, snippets, and scores. It also reports `degraded` when some upstream engines are blocked or unavailable; this is passed through diagnostics rather than treated as a failure.

## ArXiv provider

Direct API access for academic paper searches. Returns paper metadata with links. Gated by `advancedSearchBundleEnabled` and `bundleArxivSearch`, and only queried for academic intent in chat.

## Wikipedia provider

Direct API access for encyclopedia searches. Returns article summaries and links. Gated by `advancedSearchBundleEnabled` and `bundleWikipediaSearch`, and only queried for overview-style questions in chat.

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

## Supplementary direct providers

`src/lib/direct-search-providers.ts` decides whether the ArXiv and Wikipedia APIs should run for a search. It requires the Advanced Search Bundle and the corresponding provider toggle, and chat narrows the choice by query intent (ArXiv for academic, Wikipedia for overview questions).

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
- [04-integration.md](04-integration.md) — Chat tool integration
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
| `src/modules/agents/components/agents-panel.tsx` | Session panel and composer host |

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

Chat uses Pi as its main runtime for questions, research, and project work in one conversation. The separate Agents navigation and Plan/Build selector have been removed; legacy mode values remain readable in saved sessions.

- A project is optional. Without a folder, Pi receives only enabled Veyra host tools; built-in file and command tools are excluded.
- Attach a folder from Chat to enable file reads, edits, and commands. Folders are remembered as projects, and an existing project without a folder can gain one.
- The familiar Chat composer supports attachments, model selection, reasoning, web search, Skills, and MCP settings. Pi host tools use the RPC extension UI channel, with live capability and permission checks in Veyra.
- New run history shares Chat's encrypted conversation snapshot. Interrupted output is restored as stopped work. Legacy chat history can continue through Pi, and existing agent history is migrated when encrypted history hydrates.
- Responses are concise by default. Planning-only instructions are honored within the conversation without a separate mode.
- Web search runs through Veyra's existing `SearchOrchestrator` and Pi host-tool bridge. No third-party web extension is required.
- The former provider-driven Chat orchestrator, duplicate tool loop, standalone agent composer, and mode selector have been removed. Shared providers, search, artifact rendering, encrypted history, and memory services remain available to their current callers.

The detailed pages below also document the earlier standalone agent interface; confirm current UI behavior against the code.

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

# permissions > README

> Source: `docs/permissions/README.md`

# Tool Permissions

Protected tool calls pass a single shared lifecycle before they execute:

```
requested -> pending -> allowed | denied -> execution (only when allowed)
```

The gate lives at the actual execution boundary, not in the UI. Nothing about a
pending decision can approve a call on its own.

## Why the gate is inside Pi

Pi's native tools (`bash`, `read`, `write`, `edit`, `grep`, `find`, `ls`) run
inside the bundled Pi process. A frontend-only check would never see them, so
the gate uses Pi's own supported interception point: the `tool_call` extension
event. That event fires after `tool_execution_start` and strictly before the
tool executes; returning `{ block: true, reason }` replaces the execution with an
error tool result, which is also the feedback the model needs to continue.

The extension lives in `src-tauri/src/agents/chat-tools.mjs` and is written to a
temporary file on each run. It answers through Pi's RPC extension UI `input`
channel with the title `veyra_permission`.

Veyra does not implement a second shell executor: Pi keeps owning Bash
execution, streaming, timeouts, process-tree cleanup, and cancellation. The gate
only decides whether the call may start.

## Modes

| Mode | Behavior |
|------|----------|
| Ask (default) | Every protected call waits for `Accept once` or `Deny`. |
| Auto | An isolated reviewer model allows or denies each call. Any doubt blocks it. |
| Full access | Protected calls run immediately. |

Tool enablement and the existing MCP grant system stay authoritative. Full
access does not turn on a disabled tool and does not satisfy an MCP capability
approval.

## Turning Bash on and off

Bash has a switch in two places, and both are authoritative:

| Where | Scope | Effect |
|-------|-------|--------|
| Settings → Permissions → Built-in tools | Every chat | Removes Bash from what Pi is offered, so no permission mode can bring it back |
| Chat settings → Tools | One chat | Removes Bash for that chat only; the chat cannot override the global switch |

The composer control next to the input sets only the permission mode. Tool
on/off switches live in Chat settings and Settings → Permissions so each surface
has one job.

The switch does not just change the UI. The enabled set is passed to Pi as its
`--tools` allowlist, so a disabled tool is never declared to the model and never
executed. If a chat is switched off while a call is already waiting for
approval, that call is denied (`disabled`) rather than left open, and the
permission gate refuses any later call for a disabled tool in every mode.

The default mode lives in Settings → Permissions. A chat can override it next to
the composer; the override is stored per chat and a chat without an override
follows the default.

## Binding

An approval covers exactly one invocation:

- the session id,
- Pi's own tool-call id for that invocation,
- the tool name,
- the exact arguments, and
- the working directory Pi reported.

`src/modules/permissions/permission-policy.ts` builds a canonical binding and a
short fingerprint from those values. The gate re-derives the fingerprint from
the record that was displayed before honoring a decision, so mutating a pending
request cannot smuggle a different command through. A decision is never reused:
a second call, even with identical arguments, needs its own approval.

## Auto reviewer isolation

`src/modules/permissions/permission-reviewer.ts` sends only:

- a fixed review policy constant,
- the tool name,
- the exact arguments or command, and
- execution metadata (working directory, and `bash` as the shell for Bash).

It never includes conversation history, the user's messages, the assistant's
reasoning, previous tool output, project context files, Skills, or memory. The
reviewer request sets `tools: []` and `toolChoice: "none"`, so it has no tools and
cannot execute anything. Command text is framed as untrusted data in the policy.

The reviewer must return compact JSON with `decision` (`allow`/`deny`) and a
non-empty `reason`. Every other outcome — no reviewer configured, missing
provider, offline, provider error, timeout after 30 seconds, or unparsable
output — becomes `unavailable`, which the gate never treats as approval. Those
cases show the approval card with the reason so the user decides manually.

A reviewer denial is final for Auto, but the exact invocation stays held so the
user may still accept that single call by hand.

When the reviewer is a cloud provider, the Settings page states plainly that
command text and arguments are sent to that provider for the decision; LM Studio
keeps the review on the machine.

## Lifecycle details

- **Concurrency**: several calls can be pending at once; each has its own card
  and its own resolver.
- **Cancellation**: aborting a run, stopping a chat, deleting a chat, or starting
  a new turn resolves every waiting call in that chat as denied.
- **Stale approvals**: a decision for a request that is no longer pending (already
  settled, cancelled, or replaced) is inert.
- **Duplicates**: a second request for the same invocation id denies the older one
  before taking over, so two decisions can never race for one execution.
- **Mode changes**: switching a chat to Full access clears the calls waiting in
  that chat. Switching away from Auto while a review is in flight hands that call
  back to the user instead of using the late reviewer answer.
- **Cleanup**: pending requests are never persisted, so a reload cannot resurrect
  an approval.

## Persistence

Settings store the default mode, the protected tool list, and the reviewer
provider/model. The permission store persists per-chat modes and a concise local
decision history (tool name, outcome, source, short reason, timestamp). Command
text and tool arguments are never written to that history, and nothing is sent
anywhere for analytics.

## Shell discovery

Bash is only exposed while a project folder is attached. `check_bash_available`
(`src-tauri/src/agents/shell.rs`) mirrors Pi's own search order — Git Bash in
`Program Files`, then `bash.exe` on `PATH` on Windows — and reports an actionable
message when nothing is found. Veyra never switches to a different shell on its
own.

## Files

| Concern | File |
|---------|------|
| Types | `src/modules/permissions/permission-types.ts` |
| Policy, protected catalogue, binding | `src/modules/permissions/permission-policy.ts` |
| Shared lifecycle store | `src/modules/permissions/permission-store.ts` |
| Isolated reviewer | `src/modules/permissions/permission-reviewer.ts` |
| Approval card | `src/modules/permissions/components/permission-request-card.tsx` |
| Composer mode control | `src/modules/permissions/components/permission-mode-control.tsx` |
| Settings UI | `src/components/settings/permissions-settings.tsx` |
| Settings slice | `src/stores/slices/permissions-slice.ts` |
| Native interception | `src-tauri/src/agents/chat-tools.mjs` |
| Host tool gating | `src/modules/agents/pi-chat-tools.ts` |
| Shell discovery | `src-tauri/src/agents/shell.rs` |

## Known limitations

- A protected Bash call is held inside Pi's `tool_call` handler, so while a card
  is open the turn is paused. Closing the app without deciding leaves nothing
  running; the next launch starts with no pending cards.
- Every native tool call asks the host, including tools that are not protected.
  The host answers unprotected calls immediately, so the cost is one local
  round-trip per call. Snapshotting the protected list inside the Pi process to
  skip that round-trip was rejected: protecting a tool mid-run would then leave
  the already-running process executing it ungated.
- Auto quality depends on the chosen reviewer model. A weak reviewer produces
  weak decisions, and the policy can only describe intent, not prove it.
- Native `bash` remains Pi's Bash. If Pi cannot find a shell, the command fails
  with Pi's error after approval; Veyra reports the missing shell up front but
  does not substitute another interpreter.
- Protected tool coverage is a fixed catalogue. A tool that is neither in the
  catalogue nor MCP-backed cannot be individually protected yet.

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

Settings expose an `Enable Python execution` toggle. Until the Pi path actually
registers an executor and a sandbox exists, that toggle does not change model
capabilities: `pi-chat-tools.ts` passes `codeExecutionEnabled: false` when it
builds the tool list, because there is no handler that can run `run-python`
safely. Treat the control as a preference that takes effect only when execution
is re-enabled end to end.

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

Veyra keeps one owner per fact. The rule is simple: if two stores hold the same
value, one of them is a bug waiting to be reported.

## Key Files

| File | Purpose |
|------|---------|
| `src/stores/chat-store.ts` | Conversation index over the Pi transcript |
| `src/stores/settings-store.ts` | All app settings (7 slices) |
| `src/stores/provider-store.ts` | Provider connection, model listing, selected model |
| `src/stores/connectivity-store.ts` | Online/offline/local-only state |
| `src/stores/update-store.ts` | App update state |
| `src/modules/agents/agent-store.ts` | Pi sessions (the transcript) |
| `src/modules/projects/project-store.ts` | Projects, active project, workspace resources |
| `src/modules/extensions/extensions-store.ts` | MCP servers, approvals, diagnostics |
| `src/modules/extensions/skills-store.ts` | Skill library and per-request/per-chat selection |
| `src/modules/memory/memory-store.ts` | Durable memory facts |

## Ownership

| Fact | Owner | Consumers |
|------|-------|-----------|
| Session transcript | `agent-store.sessions` | `pi-conversation-storage` (mirror), chat UI |
| Conversation index (title, project, artifacts) | `chat-store` | sidebar, project sidebar |
| Active conversation | `chat-store.activeConversationId` | chat panel |
| Active project | `project-store.activeProjectId` | composer scope, memory scoping |
| Workspace path | `agent-store.projectPath` | session filtering, Pi dispatch |
| Selected model | `provider-store.selectedModel` | composer, context meter |
| Reasoning level | `settings-store` (`reasoningLevel`, `reasoningLevelByModel`) | send path, Pi model config |
| Chat behavior toggles | `settings-store` chat slice | tool registry |
| Web search defaults | `settings-store` web-search slice | search orchestrator, tools |

`chat-store` is deliberately thin: `modules/agents/pi-conversation-storage.ts`
is its only writer. It never builds a transcript of its own, and the removed
`streamingBuffer` / `toolStates` / `scratchpadContent` plumbing is gone with the
old orchestrator.

## Settings Store (7 Slices)

| Slice | File | Purpose |
|-------|------|---------|
| `ui-layout-slice` | `ui-layout-slice.ts` | Active nav, recent-chats collapsed |
| `model-slice` | `model-slice.ts` | Model defaults, per-model overrides, prompts, reasoning |
| `web-search-slice` | `web-search-slice.ts` | Search defaults, parameters, extraction |
| `code-execution-slice` | `code-execution-slice.ts` | Python execution toggle |
| `connectivity-slice` | `connectivity-slice.ts` | Online/offline preference |
| `chat-slice` | `chat-slice.ts` | Interactive answers, artifacts, background jobs |
| `update-slice` | `update-slice.ts` | Auto-check updates, dismissed version |

All settings persist to `localStorage` under `veyra.settings.v1`. Adding a field
means three edits — slice state/action, `DEFAULT_*_STATE`, and
`partializeSettings` — so a setting without a `partialize` entry silently resets
on restart.

## Agent Store Persistence

`agent-store` persists only `activeSessionId`, `projectPath`, and `projects`.
Session events live in the encrypted conversation snapshot, written by
`pi-conversation-storage.ts` on a debounce. Persisting events in both places
would rewrite every transcript on each streamed line and create two copies of
the same history that can disagree after a crash.

## Selector Discipline

- Subscribe to the narrowest slice: `useSettingsStore((s) => s.foo)`.
- Never subscribe to a whole store in a component that renders per token.
- Full-collection subscriptions belong to collection consumers (recent chats,
  project sidebar). Active-only consumers should read the active record.

## Project Scope

`project-store` mirrors a project's directory resource into
`settings.agentProjectPath`. `resolveAgentProjectId` (in
`modules/agents/agent-session-context.ts`) uses that mapping so a session keyed
by workspace path can find its project for memory and skill scoping. Ambiguous
or missing mappings fail closed: no project memory is injected.

---

# architecture > 02-ai-scheduler

> Source: `docs/architecture/02-ai-scheduler.md`

# AI Job Scheduler

Central scheduler (`src/lib/ai-scheduler.ts`) manages all AI tasks with priority-based queueing.

## Job Types (6 total)

| Type | Priority | Description |
|------|----------|-------------|
| `user_chat` | 0 (highest) | User chat requests |
| `agent_pi` | 1 | Pi CLI agent runs |
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
| `src/modules/agents/agent-session-context.ts` | Session transcript + memory budget composition |
| `src/modules/agents/agent-store.ts` | Final prompt assembly: project guidance, recorded Skill instructions, system prompt |

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

Model-facing tools are defined once in `src/lib/tool-registry.ts` and executed by
the Pi bridge in `src/modules/agents/pi-chat-tools.ts`.

## Registry

| Tool | Condition | Description |
|------|-----------|-------------|
| `web_search` | web search enabled and online | Search via the bundled DonSeTch engine; results return as a context block |
| `ask_question` | interactive answers enabled | Pause the turn and ask the user |
| `create_artifact` | artifacts enabled | Attach HTML, code, or document output to the turn |
| `generate_interactive_answer` | interactive answers enabled | Attach a live UI page written in OpenUI Lang |
| `run-python` | code execution enabled | Native Python; the Pi path currently passes `false` |

MCP tools are appended per chat from the extensions store and always require a
capability grant.

## Where Execution Lives

| Concern | File |
|---------|------|
| JSON schemas and tool list | `src/lib/tool-registry.ts` |
| MCP tool schemas, resolution, invocation | `src/modules/extensions/mcp-tool-adapter.ts` |
| Pi tool request handling | `src/modules/agents/pi-chat-tools.ts` |
| Search execution | `src/modules/web-search/orchestrator/SearchOrchestrator.ts` |
| Artifact and answer validation | `src/modules/chat/artifact.ts`, `src/modules/chat/interactive-answer.ts`, `src/modules/chat/ui/validate.ts` |
| Interactive answer component library and prompt | `src/modules/chat/ui/` |
| Tool event rendering | `src/modules/agents/components/agent-output-view.tsx` |

## Retries and Budgets

- Web search retries twice on failure (`TOOL_RETRY_LIMIT`).
- Search context is trimmed to the configured token limit before it reaches the
  model.
- MCP output is capped at 60 KB.
- Pi itself owns the tool-call loop; Veyra does not re-prompt after a tool call.

## Safety

Native code execution is not offered to models on the Pi path. Artifacts and
interactive answers are normalized and size-checked before they are stored, and
tool results are treated as untrusted context in later prompts.

Bash, and any other tool the user adds to the protected list, passes a shared
permission gate at the execution boundary. See
[Tool Permissions](../permissions/README.md).

An interactive answer program is model-written UI, so the library treats it as
untrusted: CSS values that could load resources (`url(...)`, `var(...)`) are
dropped, links and images only accept absolute `http(s)` URLs, `@OpenUrl`
validates before it hands a URL to the system browser, and icon names resolve
against a fixed set rather than the whole lucide package.

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

## Rust Modules (8 total)

| Module | Purpose |
|--------|---------|
| `agents/` | Pi CLI integration |
| `app_update` | Application auto-update download, validation, installer launch |
| `connectivity/` | Network connectivity probe |
| `extensions/` | MCP server discovery and invocation |
| `file_extraction/` | PDF, DOCX, PPTX, XLSX extraction |
| `projects/` | Project CRUD, manifest export |
| `shared/` | SQLite connection, migrations, encryption keys |
| `web_search/` | Bundled engine lifecycle, MCP bridge, page fetching |

## Command Count

**40 Tauri commands** registered across all modules. Key counts:
- Agents: 3 commands
- App update: 1 command
- Connectivity: 1 command
- Web search: 14 commands
- Projects: 5 commands
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
2. Apply the persisted UI scale (`src/lib/ui-scale.ts`, native webview zoom)
3. Load settings from localStorage
3. Connect to LM Studio
4. Load projects
5. Check Pi CLI availability
6. Initialize web search (start the bundled engine)

### Shutdown (`src/lib/app-shutdown.ts`)
1. Unload all AI models
2. Flush pending saves
3. Close SQLite connections

## Key Files

| File | Purpose |
|------|---------|
| `src-tauri/src/lib.rs` | Tauri application setup and command registration |
| `src/lib/startup.ts` | App initialization sequence |
| `src/lib/ui-scale.ts` | Native webview UI scaling and zoom shortcuts |
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

