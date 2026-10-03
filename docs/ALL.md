# Veyra — Complete Documentation
> Auto-generated from docs/INDEX.md by scripts/combine-docs.mjs
> Generated: 2026-10-03T22:03:10.421Z
> Total files: 67

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
  - [07-studio-mode](#chat-07-studio-mode)
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
- [characters](#characters)
  - [01-overview](#characters-01-overview)
  - [02-lorebook](#characters-02-lorebook)
  - [03-context-injection](#characters-03-context-injection)
  - [04-group-chat](#characters-04-group-chat)
  - [05-import-export](#characters-05-import-export)
  - [06-types](#characters-06-types)
  - [README](#characters-readme)
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
- `@tauri-apps/plugin-shell` - Shell commands (Pi CLI, Docker)

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
| Characters | SQLite via Tauri | Structured records |
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
| Characters | `docs/characters/` | Roleplay personas with lorebook, group chat, and CCv3 support |
| Research | `docs/research/` | 9-phase deep research pipeline with citation auditing |
| Web Search | `docs/web-search/` | SearXNG/Docker search with ArXiv and Wikipedia support |
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
| `characters` | Character roleplay chat |

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
  - `<veyra_character>` — Character persona (if in character mode)
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
| `web_search` | `webSearchEnabled` | Search the web via SearXNG with intent routing, time range, language, safe search, and pagination parameters |
| `scratchpad_write` | `enhancedMode` | Persistent working notes across tool rounds |
| `ask_question` | `enhancedMode` | Pause execution and ask the user a question |
| `studio_render` | `studioModeEnabled` + conversation `experience: "studio"` | Render a validated HTML/CSS Studio response |
| `studio_theme` | `studioModeEnabled` + conversation `experience: "studio"` | Restyle the chat panel, messages, and composer |

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

## Conversation Identity

Conversations preserve character identity snapshots even if the character is later deleted or renamed, ensuring chat history remains coherent.

## File Format

Each conversation is serialized as an encrypted JSON file containing:
- Messages array with content, reasoning, tool calls, and web search state
- Metadata (title, mode, character binding, project binding, timestamps)
- Conversation summary (if auto-summarized)
- Conversation `experience` (`standard` or `studio`)
- Optional message-owned `studioResponse` values with bounded revision history
- Optional conversation-owned `studioWorkspace` timeline metadata

Studio responses use the same encrypted snapshot path. Built outer iframe documents are not persisted; they are reconstructed from validated revision HTML and CSS.

---

# chat > 06-types

> Source: `docs/chat/06-types.md`

# Chat Key Types

Accurate as of the current source code (`src/modules/chat/chat-types.ts`).

## Core Message Types

```typescript
type ChatRole = "user" | "assistant" | "system";

type ChatMode = "chat" | "agents" | "research" | "characters";

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
  characterId?: string;
  characterSnapshot?: CharacterConversationSnapshot;
  characterGreetingIndex?: number;
  groupId?: string;
  groupGreetingIndex?: number;
  lmResponseId?: string;
  conversationSummary?: string;
  summaryCoversMessageCount?: number;
}
```

## Context Breakdown

```typescript
type ContextBlockCategory =
  | "system_core" | "model_identity" | "user_prompt"
  | "character" | "project" | "summary"
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

# chat > 07-studio-mode

> Source: `docs/chat/07-studio-mode.md`

# Studio

Studio is a persistent environment that the assistant shapes around a task. The main surface can become a visual explanation, chart, comparison, simulation, creative scene, or readable HTML. The conversation remains available in a drawer, and the normal composer, model selection, Stop, and host permissions remain under Veyra's control.

Studio is available for plain chat and project conversations. Character and group chats remain Standard. Enable it in **Settings → Chat → Studio Mode**, then choose **Studio** when starting an empty conversation. Disabling the global setting restores the transcript view without deleting existing responses or interaction state.

## Core experience

- The current view stays usable while a replacement loads in a separate sandboxed frame.
- A replacement becomes visible after its script initializes and reports ready. This verifies initialization, not visual quality or factual accuracy.
- If initialization fails, Veyra retains the previous usable view. Reopening a failed latest version tries earlier versions until a usable view is found.
- The footer reports gathering sources, shaping the environment, updating a view, or opening it. Stop remains accessible.
- **Conversation** opens the transcript without running duplicate copies of generated frames. Tool questions, pending MCP approvals, and message editing expose the drawer when attention is needed.
- **Undo** selects the previous version, skipping versions known to have failed in the current session. History retains failed versions for inspection or retry. **View latest** returns to the latest version.
- Source, copy, and export live in the environment options menu. Exports include selected facts and interaction state, and work without a Veyra connection.
- Text-only replies remain readable before the first environment exists; **Read response** exposes accompanying prose once a view exists.

## Model behavior and tools

The system instruction treats the environment as the primary answer. It does not require a prose preamble. Substantial text can itself be presented as readable HTML; acknowledgements and clarifying questions can remain conversational.

Three Studio tools are advertised only when Studio is enabled:

| Tool | Purpose |
|------|---------|
| `studio_render` | Create or transform a view with complete HTML, CSS, optional JavaScript, a concise summary, and optional JSON facts |
| `studio_update` | Replace the inner HTML of one unique `data-studio-region`, preserving surrounding content and omitted stylesheet, script, and facts |
| `studio_theme` | Adjust the surrounding atmosphere using a short vibe, or optional palette, font, and scoped declarations |

Region updates require the exact current environment base key. Veyra rejects stale keys, missing or ambiguous regions, invalid arguments, and unsafe merged source. Each update becomes a complete immutable revision; partial source is never executed.

Every follow-up includes the active version's summary, region names, bounded source, facts, interaction state, latest interaction, and runtime feedback. Tool rounds refresh that context. This applies to ordinary prompts such as “remove that” and “what if we double it,” rather than relying on revision keywords. Large context sections are explicitly truncated; the full validated source remains local.

## Local interaction API

Generated JavaScript runs after state initialization. The frame provides:

| API | Behavior |
|-----|----------|
| `studio.data` | JSON facts supplied with the revision, separate from appearance |
| `studio.getState()` | A copy of persistent interaction state |
| `studio.setState(object)` | Merge a small JSON state patch |
| `studio.emit(name, payload)` | Record a selection or other interaction for the next prompt |
| `studio.chart(element, options)` | Local SVG bar or line chart with labels, numeric values, optional color/title, and optional `onSelect` callback |

Charts support pointer and keyboard selection, expose accessible values, and restore their saved selection. Chart options use `type: "bar" | "line"`, `labels`, and `values` (1–200 finite numbers). No external chart dependency is loaded.

Inputs, selects, and textareas with stable `name` or `data-studio-key` attributes automatically preserve values. Password, file, and hidden inputs are excluded. Scroll position is retained. Custom controls use `studio.setState`. Form-control values and scroll position use reserved `$controls` and `$scroll` state keys.

Events do not automatically start a model request or execute a host action. Local controls respond immediately; the user sends a prompt when interpretation or new information is needed. The last selected chart category is surfaced in the footer and included in follow-up context.

## Runtime feedback and repair

The bridge supports initialization, readiness, state, interaction, and error messages. Veyra verifies the originating frame window and a per-frame channel, then validates JSON shape, nesting, size, event names, and version ownership. It exposes no generic host command.

Script errors and unhandled promise rejections are reported to Veyra. During a foreground tool round, Veyra waits briefly for the exact originating version's feedback, releasing immediately on cancellation. One runtime repair is allowed per assistant job; another failure stops automatic view generation for that job. Invalid source also has one bounded repair opportunity.

Background or unmounted conversations save source without claiming successful display. Late errors remain available to the next prompt and the **Repair** action. A view that does not initialize within six seconds offers retry or repair. The previous usable view remains available throughout recovery.

## Storage and compatibility

Generated source remains on `assistantMessage.studioResponse`, with at most eight revisions per message. Environment history is derived from those revisions in creation order, including regenerated older messages. It does not duplicate their source in a separate workspace snapshot.

`conversation.studioEnvironment` stores only selection, interaction state, latest event, and runtime feedback in the existing encrypted conversation snapshot. State and event payloads are limited to 16 KB; revision facts are limited to 32 KB. Unsafe keys, non-JSON values, excessive depth, and oversized payloads are rejected. State changes are coalesced by the frame and use the existing debounced encrypted persistence.

Existing message-owned Studio responses remain usable, including previously selected revisions. Forks copy state and remap selected message identities. Stale selection/feedback references are discarded during normalization. The old `presentationMode` and `studioArtifact` fields remain unsupported. No development-data reset is required.

## Isolation and preferences

Frames have an opaque origin with `sandbox="allow-scripts"` and restrictive CSP. There are no network connections, remote libraries/fonts/images/media, child frames, workers, form submissions, or filesystem/Tauri/clipboard/device permissions. Inline SVG, CSS, DOM interaction, and the narrow local bridge are supported. External data still comes through Veyra's existing provider tools and their permission flows.

**Presentation** offers Automatic, Calm, and Expressive. Automatic follows the task; Calm asks for restrained styling and disables CSS motion; Expressive invites distinctive art direction. System reduced-motion preferences are observed. Generated JavaScript must also honor reduced motion; arbitrary script animation cannot be mechanically rewritten.

## Verification and key files

- `studio-environment.ts`: timeline, bounded JSON, bridge parsing, and state normalization
- `components/studio-environment-view.tsx`: primary surface, staged rendering, history, recovery, source, and export
- `studio-bridge.ts`: frame-local state, controls, charts, readiness, and runtime feedback
- `studio-runtime.ts`: validated commits and bounded feedback/repair handling
- `studio-update-tool.ts`: targeted updates with base-version checks
- `studio-context.ts`: environment-first instructions and continuity
- `chat-panel.tsx`: Studio surface, conversation drawer, attention handling, and existing composer
- `chat-store.ts`: message-owned source, encrypted environment state, selection, and forks

Focused unit tests cover continuity, normalization, limits, ownership, forks, and cancellation. Browser tests run the real ChatPanel in an isolated Vite/Playwright fixture with synthetic data and mocked Tauri storage. They cover frame transitions, controls, chart selections, recovery, questions, targeted validation, spoofed messages, responsive layout, portable export, and bounded repair. The browser test requires Playwright Chromium or installed Microsoft Edge.

Local diagnostics remain source-free. The existing 5 MB response snapshot threshold remains a signal to reconsider separate encrypted source storage.

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
- [07-studio-mode.md](07-studio-mode.md) — Studio presentation, artifacts, and export

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

# characters > 01-overview

> Source: `docs/characters/01-overview.md`

# Characters Overview

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
| `src/modules/characters/ai-assist/` | AI-assisted creation and CCv3 I/O |

## Character Fields

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

## Starting a Character Chat

1. `startCharacterChat()` creates a new conversation bound to the character
2. The greeting is randomly picked from `firstMessage` + `alternateGreetings`
3. The conversation is pre-seeded with the greeting as the first assistant message
4. Character identity snapshots are preserved even if the character is later deleted or renamed

## Character Chat Defaults

Per-character settings that override global settings:

| Setting | Description |
|---------|-------------|
| `scanDepth` | How many messages to scan for lorebook matches |
| `maxLorebookEntries` | Maximum lorebook entries to inject |
| `includeExamples` | Whether to include few-shot examples |
| `allowDocumentTools` | Whether doc tools are available in character chat |

---

# characters > 02-lorebook

> Source: `docs/characters/02-lorebook.md`

# Lorebook System

Lorebook entries provide contextual knowledge that's injected into the chat when triggered by keyword matches.

## Entry Fields

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

## How Lorebook Works

1. The engine scans trailing messages for keyword matches
2. Matches are filtered by probability rolls
3. Entries are sorted by priority, then insertion order
4. Results are capped at `maxLorebookEntries` (default from chat defaults)
5. Matched entries are injected into `<veyra_lorebook>` block

## Scan Depth

Controls how many recent messages are scanned for keyword matches (configurable per character). Higher values include more context but may trigger more entries.

---

# characters > 03-context-injection

> Source: `docs/characters/03-context-injection.md`

# Character Context Injection

When a character is active, the system prompt includes these XML blocks:

1. **`<veyra_character>`** — Persona block (name, description, personality, scenario)
2. **`<veyra_character_system>`** — System prompt override (if provided)
3. **`<veyra_character_examples>`** — Few-shot examples (if enabled)
4. **`<veyra_lorebook>`** — Matched lorebook entries
5. **Post-history instructions** — Instructions after chat history

## Context Size Limits

Total character context is soft-capped at **16,000 characters** with truncation to prevent overflow of the model's context window.

## Conditional Inclusion

- System prompt override only included if the character defines one
- Few-shot examples only included if `includeExamples` is enabled in chat defaults
- Lorebook block only included if triggered entries exist

---

# characters > 04-group-chat

> Source: `docs/characters/04-group-chat.md`

# Group Chat

Multiple characters can share a conversation with manual or automatic speaker selection.

## Group Fields

| Field | Description |
|-------|-------------|
| `name` | Group display name |
| `memberIds` | Array of character IDs |
| `speakerMode` | `manual` (user picks) or `auto` (AI selects) |
| `openingMessage` | Group greeting |
| `activeSpeakerId` | Currently active character |

## Group Chat Flow

1. `startGroupChat()` creates a conversation with the group binding
2. The `activeSpeaker` character responds to each turn
3. **Manual mode**: user selects which character speaks
4. **Auto mode**: AI selects the most appropriate speaker
5. `regenerateGroupGreeting()` swaps the opening message

## Group Context

Each group turn includes the speaker's character block in the prompt, ensuring the AI responds in that character's voice and personality.

---

# characters > 05-import-export

> Source: `docs/characters/05-import-export.md`

# Character Import/Export

## Export Formats

| Format | Description |
|--------|-------------|
| Veyra JSON | Native Veyra format with all fields preserved |
| Character Card V3 JSON | Standard CCv3 format (SillyTavern compatible) |
| Character Card V3 PNG | PNG with embedded CCv3 metadata chunk |

## Import

- Import from Veyra JSON or Character Card V3 JSON
- PNG cards with CCv3 metadata chunks are also supported
- Fields are mapped from CCv3 spec to Veyra's internal model

## AI-Assisted Creation

The `ai-assist/` module provides:
- Describe a character and the AI generates the full record
- AI generates lorebook entries from descriptions
- Tone and style suggestion for personality fields
- Character descriptions from CCv3 card parsing

---

# characters > 06-types

> Source: `docs/characters/06-types.md`

# Characters Key Types

From `src/modules/characters/character-types.ts`:

```typescript
type CharacterSpec = "veyra" | "chara_card_v3";
type CharacterSource = "native" | "imported_ccv3" | "duplicate";
type CharacterScope = "global" | "project";

interface CharacterRecord {
  id: string;
  name: string;
  title?: string;
  avatarPath?: string;
  avatarColor?: string;
  tagline: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  alternateGreetings: string[];
  systemPrompt: string;
  postHistoryInstructions?: string;
  exampleMessages: ExampleMessage[];
  creatorNotes: string;
  tags: string[];
  category?: string;
  version: string;
  spec: CharacterSpec;
  creator: string;
  source: CharacterSource;
  isGlobal: boolean;
  projectId?: string;
  creatorMetadata?: Record<string, unknown>;
  stats: CharacterStats;
  lorebookEntries?: CharacterLorebookEntry[];
  chatDefaults?: CharacterChatDefaults;
  createdAt: string;
  updatedAt: string;
}

interface CharacterLorebookEntry {
  id: string;
  characterId: string;
  keys: string[];
  secondaryKeys?: string[];
  content: string;
  constant: boolean;
  selective: boolean;
  insertionOrder: number;
  priority: 1 | 2 | 3 | 4 | 5;
  enabled: boolean;
  matchType: "any" | "all" | "regex";
  caseSensitive: boolean;
  scope: "character" | "global";
  group?: string;
  comment?: string;
  position: "before" | "after";
  probability?: number;
  recurseDepth?: number;
  createdAt: string;
  updatedAt: string;
}

interface CharacterChatDefaults {
  scanDepth: number;
  maxLorebookEntries: number;
  includeExamples: boolean;
  allowDocumentTools: boolean;
}

interface CharacterGroupRecord {
  id: string;
  name: string;
  description: string;
  scenario: string;
  memberIds: string[];
  speakerMode: "manual" | "auto";
  recentConversationIds: string[];
  openingMessage: string;
  activeSpeakerId?: string;
  isGlobal: boolean;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}
```

---

# characters > README

> Source: `docs/characters/README.md`

# Characters Module

Roleplay persona system with Character Card V3 support, lorebook matching, group chat, and AI-assisted creation.

## Contents

- [01-overview.md](01-overview.md) — Character fields, chat defaults, starting a chat
- [02-lorebook.md](02-lorebook.md) — Lorebook keyword matching and injection
- [03-context-injection.md](03-context-injection.md) — XML context blocks and size limits
- [04-group-chat.md](04-group-chat.md) — Multi-character group conversations
- [05-import-export.md](05-import-export.md) — Export formats and AI-assisted creation
- [06-types.md](06-types.md) — Key type definitions

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

Optional web search capability via SearXNG (Docker) with direct ArXiv and Wikipedia API support. Used by both the chat tool and the research pipeline.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/web-search/types.ts` | Type definitions |
| `src/modules/web-search/orchestrator/SearchOrchestrator.ts` | Main search orchestrator |
| `src/modules/web-search/search-planner.ts` | Multi-query generation |
| `src/modules/web-search/search-ranker.ts` | URL canonicalization, deduplication, RRF fusion, composite ranking, and domain diversification |
| `src/modules/web-search/search-routing.ts` | Intent-based category/engine routing |
| `src/modules/web-search/passage-ranker.ts` | Lexical passage ranking from fetched pages |
| `src/modules/web-search/search-evaluation.ts` | Retrieval quality metrics (recall, MRR, nDCG) |
| `src/modules/web-search/searx-capabilities-service.ts` | SearXNG `/config` capabilities with caching |
| `src/modules/web-search/searxng-setup.ts` | Docker setup for SearXNG |
| `src/modules/web-search/providers/` | Provider implementations |
| `src/modules/web-search/tauri-commands.ts` | Tauri IPC for page fetching and capabilities |

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

---

# web-search > 02-search-flow

> Source: `docs/web-search/02-search-flow.md`

# Web Search Flow

## Intent Routing

`search-routing.ts` resolves search intent before query execution. The model can supply an explicit `intent`, or it's inferred from the query text:

| Intent | Trigger Keywords |
|--------|-----------------|
| news | latest, today, breaking, current events |
| academic | study, paper, research, journal, arxiv, pubmed |
| code | error, stack trace, typescript, python, rust, github |
| documentation | docs, documentation, reference, manual |
| local | near me, directions, map |
| discussion | reddit, forum, opinions |

The router maps each intent to SearXNG categories and engine hints, filtered against the instance's live capabilities from `SearxCapabilities`.

## Capability Discovery

On each search, `searx-capabilities-service.ts` fetches the SearXNG `/config` endpoint to discover available engines, categories, and locales. Results are cached for 10 minutes with request deduplication. This enables adapter-free routing: Veyra automatically adapts to any SearXNG instance's installed engines.

## Query Planning

`search-planner.ts` generates multiple search queries from a single user query across different lanes:

| Lane | Purpose | Example |
|------|---------|---------|
| General | Standard search | "quantum computing applications" |
| Recent | Current year filter | "quantum computing 2025 applications" |
| Academic | Scholarly sources | "quantum computing applications research paper" |
| Primary | Government/data sources | "quantum computing applications site:gov" |
| Opposing | Criticism/limitations | "quantum computing limitations problems" |

## Concurrent Execution

- Queries are executed concurrently (max 3 at a time)
- Each query hits the SearXNG API with routing parameters (categories, engines, page, language, safe search)
- ArXiv and Wikipedia direct searches run in parallel when applicable

## Deduplication and Ranking

`search-ranker.ts` applies a multi-stage pipeline: URL canonicalization, deduplication, Reciprocal Rank Fusion (RRF), scoring, and domain diversification.

### URL Canonicalization

`normalizeSearchUrl()` maps variant URLs to a canonical key before deduplication:

- Strips tracking parameters: `utm_*`, `fbclid`, `gclid`, `msclkid`, `ref`, `ref_src`, `source`
- Removes URL fragments (`#section`)
- Normalizes trailing slashes (strips `/` suffix)
- Lowercases the entire URL
- Note: remaining query parameters are not sorted, so `?a=1&b=2` and `?b=2&a=1` produce different keys

The `hostname()` helper separately strips `www.` and lowercases the host. Redirects are not followed (disabled in the fetch client for SSRF safety); the Wayback Machine fallback recovers content when the original URL fails.

### Deduplication

Three strategies collapse duplicates, applied in priority order:

1. **Canonical URL key** — normalized URLs map to the same group
2. **Content-based** — when fetched content exceeds 300 characters, identical normalized content across different hosts is collapsed
3. **Title similarity** — syndicated articles with ≥92% Jaccard token overlap across different hosts are collapsed

### Reciprocal Rank Fusion (RRF)

Each deduplicated group receives an RRF score:

```
score = Σ(weight / (K + rank)) × 20
```

Where `K = 60` and per-lane weights:

| Lane | Weight |
|------|--------|
| primary | 1.1 |
| academic | 1.1 |
| recent | 1.05 |
| general | 1.0 |
| opposing | 0.7 |

A result appearing across multiple queries and lanes accumulates a higher RRF score. Because RRF operates on rank position rather than raw provider scores, it is resistant to incomparable or unscaled scores from different search engines.

### Composite Score

Final ranking combines RRF with additional signals:

- **Multi-provider bonus** (+0.12 per provider)
- **Multi-lane bonus** (+0.08 per lane)
- **Query term coverage** (×0.3, ratio of query tokens matched in title/snippet)
- **Authority boost** (+0.25 for `.gov`, `.edu`, WHO, NIH, World Bank, UN, etc.; –0.15 for Pinterest, Quora, Medium, Substack, SlideShare)
- **Freshness boost** (+0.18 ≤30 days, +0.12 ≤180 days, +0.06 ≤2 years)
- **Extraction boost** (+0.15 if content was successfully fetched; –0.08 if fetch failed)
- **Lane relevance score** (up to +0.2 for domain/content matching the query lane)

### Domain Diversity

After scoring, results are diversified by domain. A domain may contribute at most 2 results, and this cap only applies once half the desired result count (`ceil(maxResults / 2)`) is already placed — so top-ranked results are never excluded. Low-value domains (Medium, Quora, etc.) are filtered earlier if there are enough candidates.

## Passage Ranking

After pages are fetched, `passage-ranker.ts` splits each page into blocks, scores them against the query via lexical overlap, and returns the top passages (default 3, max 1600 chars each). Passages include heading context and character offsets for provenance. The context bundle uses passages instead of raw page content when available.

## Page Fetching

- Top results are fetched via Tauri IPC
- Content is extracted from HTML, with Wayback Machine fallback
- Fetch status is tracked per result

## Speed Preset

Callers can override the user's search-speed preset at runtime via `speedPreset` in `RunSearchOptions`:

| Preset | Effect |
|--------|--------|
| `"fast"` | Skips page fetching, returns up to 3 snippet-only results, disables multi-query fusion and adaptive fallback |
| `"normal"` | Full-quality search respecting user settings for fetch, fusion, ranking, and capabilities |

The research pipeline uses `"normal"` for background and gap-phase searches to ensure complete source collection, regardless of the user's configured speed preset.

## Context Bundle

Returns a `SearchContextBundle` containing:
- `sources` — Array of search results with metadata and ranked passages
- `summaries` — Page content summaries
- `diagnostics` — Timing, routing decisions, capability availability

---

# web-search > 03-providers

> Source: `docs/web-search/03-providers.md`

# Search Providers

| Provider | Description |
|----------|-------------|
| SearXNG | Self-hosted search via Docker container — primary provider |
| ArXiv | Direct ArXiv API for academic papers |
| Wikipedia | Direct Wikipedia API |

## Provider Architecture

Each provider implements a common interface in `src/modules/web-search/providers/`:
- Accepts search input (query, num results, freshness)
- Returns normalized `SearchResult` objects
- Providers are selected based on availability and search context

## SearXNG Provider

The primary provider. Requires a running Docker container on localhost. Handles:
- General web search queries with intent-based category/engine routing
- Date-filtered searches for recency (`timeRange` parameter)
- Paginated results (`page` parameter)
- Language/locale filtering
- Safe search levels (0 off, 1 moderate, 2 strict)
- Result parsing and normalization
- Capability discovery via `get_searxng_capabilities` Tauri command (fetches `/config`)

## ArXiv Provider

Direct API access for academic paper searches. Returns paper metadata with links.

## Wikipedia Provider

Direct API access for encyclopedia searches. Returns article summaries and links.

---

# web-search > 04-integration

> Source: `docs/web-search/04-integration.md`

# Web Search Integration

## Chat Tool Integration

In chat, the `web_search` tool triggers search with additional optional parameters:

```json
{
  "query": "string",
  "intent": "general | news | academic | code | documentation | local | discussion",
  "timeRange": "day | week | month | year",
  "language": "en-US",
  "safeSearch": 0,
  "page": 1
}
```

Parameters beyond `query` are optional. When omitted, the intent is inferred from the query text and routing is handled by `search-routing.ts`.

The tool has retry logic (up to 2 retries) and real-time UI updates showing:
- **Search phase**: querying sources
- **Fetch phase**: downloading content
- **Reading phase**: extracting text

## Research Pipeline Integration

The research module uses the search orchestrator with:
- Multiple queries per research step
- Source type filtering
- Higher fetch limits for thorough research
- Credibility scoring integration

## Direct Search Providers

`src/lib/direct-search-providers.ts` provides an alternative search path using Serper and Serpstack APIs that bypasses the full SearXNG orchestration for lightweight queries.

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
  language?: string;
  categories?: string;
  engines?: string;
  timeRange?: SearchTimeRange;
  safeSearch?: 0 | 1 | 2;
  page?: number;
};

type SearchIntent =
  | "general"
  | "news"
  | "academic"
  | "code"
  | "documentation"
  | "local"
  | "discussion";

type SearchTimeRange = "day" | "week" | "month" | "year";

type SearxCapabilities = {
  engines: Array<{
    name: string;
    shortcut: string;
    categories: string[];
    enabled: boolean;
  }>;
  categories: string[];
  locales: string[];
  safeSearch: 0 | 1 | 2;
  fetchedAt: number;
};

interface SearchProvider {
  id: string;
  name: string;
  type: "searxng" | "brave" | "custom" | "direct_source";
  search(input: SearchInput): Promise<SearchResult[]>;
  testConnection?(): Promise<boolean>;
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
  rankScore?: number;
  rankReason?: string;
  queryLane?: string;
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

type SearchPassage = {
  sourceId: string;
  heading?: string;
  text: string;
  startOffset?: number;
  endOffset?: number;
  lexicalScore: number;
  finalScore: number;
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
    freshnessBoosted?: boolean;
    qualityFiltered?: boolean;
    capabilitiesAvailable?: boolean;
    routedCategories?: string[];
    routedEngines?: string[];
  };
};

type FetchedPageSummary = {
  url: string;
  status: FetchStatus | string;
  title: string | null;
  content: string | null;
  error_reason: string | null;
  source_type?: string | null;
  extraction_method?: string | null;
  via_wayback?: boolean | null;
  char_count?: number | null;
};
```

## Search Lanes

| Lane | Purpose |
|------|---------|
| `general` | Standard search |
| `recent` | Current year filter |
| `academic` | Scholarly sources |
| `primary` | Government/data sources |
| `opposing` | Criticism/limitations |

## Search Intents

| Intent | Categories | Engine Hints |
|--------|-----------|--------------|
| `general` | general | wikipedia |
| `news` | news | — |
| `academic` | science | arxiv, pubmed, semantic scholar, openalex |
| `code` | it | github, stackoverflow |
| `documentation` | it | github, stackoverflow |
| `local` | map | openstreetmap |
| `discussion` | general, social media | reddit |

---

# web-search > README

> Source: `docs/web-search/README.md`

# Web Search Module

Optional web search via SearXNG (Docker), ArXiv, and Wikipedia APIs.

## Contents

- [01-setup.md](01-setup.md) — SearXNG Docker setup and security
- [02-search-flow.md](02-search-flow.md) — Query planning, execution, ranking
- [03-providers.md](03-providers.md) — Search providers (SearXNG, ArXiv, Wikipedia)
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
| `local_service` | Requires local service (LM Studio, Docker) |
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
| `src/stores/settings-store.ts` | Combined settings (9 slices) |
| `src/stores/provider-store.ts` | Provider and model management |
| `src/stores/connectivity-store.ts` | Connectivity state |
| `src/stores/update-store.ts` | App update state |

## Zustand Stores (11 total)

Stores live in both `src/stores/` and `src/modules/<feature>/`:

| Store Hook | Location | Purpose |
|------------|----------|---------|
| `useChatStore` | `src/stores/chat-store.ts` | Conversations, streaming buffer, messages |
| `useSettingsStore` | `src/stores/settings-store.ts` | All app settings (9 slices) |
| `useProviderStore` | `src/stores/provider-store.ts` | Provider connection, model listing |
| `useConnectivityStore` | `src/stores/connectivity-store.ts` | Online/offline/local-only state |
| `useUpdateStore` | `src/stores/update-store.ts` | App update state |
| `useCharacterStore` | `src/modules/characters/character-store.ts` | Character records |
| `useCharacterGroupStore` | `src/modules/characters/character-group-store.ts` | Character groups |
| `useCharacterAssistStore` | `src/modules/characters/ai-assist/ai-assist-store.ts` | AI-assisted creation state |
| `useProjectStore` | `src/modules/projects/project-store.ts` | Projects |
| `useResearchStore` | `src/modules/research/research-store.ts` | Research runs and reports |
| `useAgentStore` | `src/modules/agents/agent-store.ts` | Agent sessions |

## Settings Store (9 Slices)

The settings store is composed from 9 slices in `src/stores/slices/`:

| Slice | File | Purpose |
|-------|------|---------|
| `ui-layout-slice` | `ui-layout-slice.ts` | Active nav, panel collapsed state, visible tool settings |
| `model-slice` | `model-slice.ts` | Default model, temperature, context length |
| `web-search-slice` | `web-search-slice.ts` | SearXNG URL, provider settings |
| `character-slice` | `character-slice.ts` | AI assist model, max tokens, tone settings |
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

## Job Types (8 total)

| Type | Priority | Description |
|------|----------|-------------|
| `user_chat` | 0 (highest) | User chat requests |
| `agent_pi` | 1 | Pi CLI agent runs |
| `research_run` | 1 | Research pipeline execution |
| `auto_name_chat` | 2 | Auto-generate conversation titles |
| `character_ai_assist` | 2 | AI-assisted character creation |
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
<veyra_character>   — Character persona
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
| `web_search` | `webSearchEnabled` | Search the web via SearXNG. Parallel execution with up to 2 retries. |
| `scratchpad_write` | `enhancedMode` | Persistent working notes across tool rounds. |
| `ask_question` | `enhancedMode` | Pause execution to ask the user a question. |
| `studio_render` | `studioEnabled` | Render a validated HTML/CSS Studio response in an isolated iframe. |
| `studio_theme` | `studioEnabled` | Restyle the chat panel, messages, and composer via vibe or complete palette. |

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
| `src/modules/chat/studio/studio-tool.ts` | `studio_render` tool definition and argument parsing |
| `src/modules/chat/studio/studio-theme-tool.ts` | `studio_theme` tool definition and argument parsing |
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

## Rust Modules (10 total)

| Module | Purpose |
|--------|---------|
| `agents/` | Pi CLI integration |
| `app_update` | Application auto-update download, validation, installer launch |
| `characters/` | Character and group CRUD, I/O commands, avatar management |
| `connectivity/` | Network connectivity probe |
| `extensions/` | MCP server discovery and invocation |
| `file_extraction/` | PDF, DOCX, PPTX, XLSX extraction |
| `projects/` | Project CRUD, manifest export |
| `research/` | Research run, step, source, evidence, claim, contradiction, report CRUD |
| `shared/` | SQLite connection, migrations, encryption keys |
| `web_search/` | SearXNG Docker management, page fetching |

## Command Count

**~78 Tauri commands** registered across all modules. Key counts:
- Agents: 3 commands
- App update: 1 command
- Connectivity: 1 command
- Web search: 14 commands
- Projects: 5 commands
- Research: 15 commands
- Characters: 17 commands
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
4. Load characters and projects
5. Check Pi CLI availability
6. Initialize web search (check Docker/SearXNG)

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

