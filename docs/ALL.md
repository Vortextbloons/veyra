# Veyra — Complete Documentation
> Auto-generated from docs/INDEX.md by scripts/combine-docs.mjs
> Generated: 2026-07-17T19:14:14.172Z
> Total files: 79

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
- [memory](#memory)
  - [01-modes](#memory-01-modes)
  - [02-node-types](#memory-02-node-types)
  - [03-extraction](#memory-03-extraction)
  - [04-retrieval](#memory-04-retrieval)
  - [05-retention](#memory-05-retention)
  - [06-profile](#memory-06-profile)
  - [07-types](#memory-07-types)
  - [README](#memory-readme)
- [hooks](#hooks)
  - [01-overview](#hooks-01-overview)
  - [README](#hooks-readme)
- [documents](#documents)
  - [01-overview](#documents-01-overview)
  - [02-editor](#documents-02-editor)
  - [03-tools](#documents-03-tools)
  - [04-versioning](#documents-04-versioning)
  - [05-types](#documents-05-types)
  - [README](#documents-readme)
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
- [email](#email)
  - [01-setup](#email-01-setup)
  - [02-features](#email-02-features)
  - [03-tauri-commands](#email-03-tauri-commands)
  - [04-types](#email-04-types)
  - [README](#email-readme)
- [agents](#agents)
  - [01-overview](#agents-01-overview)
  - [02-session-management](#agents-02-session-management)
  - [03-events](#agents-03-events)
  - [04-ui](#agents-04-ui)
  - [05-tauri-commands](#agents-05-tauri-commands)
  - [06-types](#agents-06-types)
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
| Conversations | `%APPDATA%/com.veyra.app/` | AES-GCM encrypted JSON |
| Memory DB | `%APPDATA%/com.veyra.app/` | SQLite |
| Settings | localStorage | `veyra.settings.v1` key |
| Provider config | localStorage | `veyra.provider.v1` key |
| Characters | SQLite via Tauri | Structured records |
| Documents | SQLite via Tauri | Structured records |
| Projects | SQLite via Tauri | Structured records |
| Research | SQLite via Tauri | Structured records |
| Email accounts | SQLite via Tauri | Structured records |
| Agent sessions | localStorage | Serialized sessions |
| Cloud credentials | OS credential vault | Tauri secure storage |

## Privacy

- No data leaves the machine unless the user explicitly enables web search, cloud providers, or email sync
- Cloud API keys are stored in the operating-system credential vault through Tauri and are excluded from Zustand persistence
- AES-GCM encryption for conversation files with keys managed by the Rust backend
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
| Chat | `docs/chat/` | Core AI chat pipeline with streaming, tool calls, and memory injection |
| Memory | `docs/memory/` | Local-first memory system with 5 modes and 10 node types |
| Documents | `docs/documents/` | Markdown document editor with versioning and AI assistance |
| Characters | `docs/characters/` | Roleplay personas with lorebook, group chat, and CCv3 support |
| Research | `docs/research/` | 9-phase deep research pipeline with citation auditing |
| Web Search | `docs/web-search/` | SearXNG/Docker search with ArXiv and Wikipedia support |
| Projects | `docs/projects/` | Per-project containers for scoping chats, memory, and settings |
| Email | `docs/email/` | Gmail OAuth and IMAP email client |
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

The chat module is Veyra's core AI pipeline. It manages conversations, streaming responses, tool calls, memory injection, and context window management.

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
- Handles explicit memory saves if requested
- Prepares the model via LM Studio adapter

### 3. Orchestrator (`sendChatRequest`)
- **Memory pack**: Builds memory context from relevant stored memories
- **System prompt composition**: Assembles context blocks from `BuildChatContextOptions`:
  - `<veyra_core>` — Base AI identity
  - `<model_identity>` — Model name/identity
  - `<veyra_user_prompt>` — Custom user instructions
  - `<veyra_project>` — Active project context
  - `<veyra_character>` — Character persona (if in character mode)
  - `<veyra_context>` — Date, time, platform info (context anchoring)
  - `<veyra_documents>` — Document tool instructions
  - `<veyra_memory>` — Retrieved memory nodes
  - `<veyra_conversation_summary>` — Summary of older turns
  - `<veyra_tools>` — Available tool definitions
- **Message trimming**: Fits messages within the token budget (context limit minus reserved output)
- **Streaming**: Provider adapter streams tokens with callbacks for content, reasoning, and tool calls
- **Enhanced mode**: When enabled, adds `scratchpad_write` and `ask_question` tools, increases max tool rounds from 6 to 10

### 4. Post-Chat Jobs
After the response completes:
- **Memory handoff**: Explicit memory saves
- **Auto-summarization**: If context usage > 55%, older turns are folded into a summary
- **Memory extraction**: LLM extracts memory candidates from the conversation

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
| `web_search` | `webSearchEnabled` | Search the web via SearXNG |
| `code_execution` | `codeExecutionEnabled` | Run Python code via Tauri |
| `doc_create` | `documentToolsEnabled` | Create a new document |
| `doc_read` | `documentToolsEnabled` | Read a document |
| `inline_edit` | `documentToolsEnabled` | Edit a document with section/heading targeting |
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
- Document mutations retry up to 2 times with LLM-based re-prompting for corrections
- `doc_update` is a legacy constant kept for backward-compatible runtime handling; it has been replaced by `inline_edit`

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

## Provider Compatibility

Both LM Studio and cloud providers use the same streaming interface, ensuring consistent UI behavior regardless of provider.

---

# chat > 05-storage

> Source: `docs/chat/05-storage.md`

# Conversation Storage

## Encryption

- Conversations are encrypted with **AES-GCM** using keys from the Rust backend
- Web Workers handle encryption/decryption without blocking the UI
- Encryption keys are managed securely via Tauri
- Legacy key migration is supported on startup

## Persistence

- Debounced saves (500ms) to avoid excessive I/O
- Stored in `%APPDATA%/com.veyra.app/` as JSON files
- Key rotation is supported

## Conversation Identity

Conversations preserve character identity snapshots even if the character is later deleted or renamed, ensuring chat history remains coherent.

## File Format

Each conversation is serialized as an encrypted JSON file containing:
- Messages array with content, reasoning, tool calls, and web search state
- Metadata (title, mode, character binding, project binding, timestamps)
- Conversation summary (if auto-summarized)

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
  memoryPack?: MemoryPack;
  memoryRetrieval?: MemoryRetrievalInfo;
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
  memoryLastProcessedMessageCount?: number;
  memoryPendingSince?: number;
}
```

## Context Breakdown

```typescript
type ContextBlockCategory =
  | "system_core" | "model_identity" | "user_prompt"
  | "memory" | "character" | "project" | "summary"
  | "context_anchor" | "documents_instructions"
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

Core AI chat pipeline with streaming, tool calls, memory injection, and context window management.

## Contents

- [01-pipeline.md](01-pipeline.md) — Pipeline flow and orchestration
- [02-tools.md](02-tools.md) — Tool call execution
- [03-context-window.md](03-context-window.md) — Context window management
- [04-streaming.md](04-streaming.md) — Streaming behavior
- [05-storage.md](05-storage.md) — Conversation encryption and persistence
- [06-types.md](06-types.md) — Key type definitions

---

# memory > 01-modes

> Source: `docs/memory/01-modes.md`

# Memory Modes

The memory system operates in one of 5 modes, controlling the balance between automatic capture and user control.

| Mode | Behavior |
|------|----------|
| `off` | No extraction or retrieval |
| `manual_only` | Only explicit "remember this" saves |
| `safe_auto_save` | Auto-save high-confidence extractions |
| `review_all` | Extract everything, require manual approval |
| `aggressive_project_memory` | Maximum extraction with project scoping |

## Mode Selection

- Mode is set globally in settings and can be overridden per project
- `off` is useful for sensitive or transient conversations
- `aggressive_project_memory` is designed for long-running project work where maximum context capture is desired

---

# memory > 02-node-types

> Source: `docs/memory/02-node-types.md`

# Memory Node Types

## Node Types

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

## Priorities

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

## Protected Memories

The following are never auto-archived:
- Pinned memories
- Permanent priority
- Importance >= 5
- Explicit user saves
- Manual edits
- Profile setup nodes

---

# memory > 03-extraction

> Source: `docs/memory/03-extraction.md`

# Memory Extraction

Extraction happens post-chat, using the LLM to identify memory-worthy content from the conversation transcript.

## Pipeline

1. `shouldExtractMemoryBatch()` checks if enough new messages exist (min 4 messages, 2 exchanges)
2. `runMemoryExtractionBatch()` sends the transcript to the LLM
3. LLM outputs JSON with memory candidates
4. Deduplication: text similarity + optional vector similarity against existing memories
5. High-confidence items are auto-saved; others require review
6. Batch size capped at 16 messages; 90-second pending threshold

## Extraction Modes

The extraction behavior varies by memory mode:
- **safe_auto_save**: Only high-confidence extractions are saved automatically
- **review_all**: All extractions are saved but require manual review
- **aggressive_project_memory**: Maximum batch size and lower confidence thresholds

## AI Job Scheduling

Memory extraction runs as a background job (priority 3) via the AI job scheduler, ensuring it never blocks user chat.

---

# memory > 04-retrieval

> Source: `docs/memory/04-retrieval.md`

# Memory Retrieval

Retrieval runs pre-chat to find relevant memories for the current conversation context.

## Pipeline

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

## Scoring Factors

Each candidate memory receives a composite score considering:
- Text similarity to the user's message
- Memory importance and confidence
- Whether the memory is pinned
- Recency of the memory
- Project and category alignment with current context

---

# memory > 05-retention

> Source: `docs/memory/05-retention.md`

# Memory Retention

Periodic cleanup and eviction keep the memory system from growing unbounded.

## Eviction Thresholds

| Scope | Max Nodes |
|-------|-----------|
| Global | 200 |
| Per project | 100 |
| Per conversation | 30 |

## Eviction Strategy

1. Expired ephemeral nodes (7-day TTL) are archived first
2. Low-priority nodes are evicted next
3. Least recently accessed nodes within the same priority band are removed

## Protected Memories

See `02-node-types.md` for the full protected memory list. Key protections:
- Pinned and permanent memories are never evicted
- Importance >= 5 is immune
- User-explicit saves and manual edits are preserved

## Scheduling

Retention runs as a maintenance job (priority 4) during idle scheduler time.

---

# memory > 06-profile

> Source: `docs/memory/06-profile.md`

# Profile Setup

The user profile system captures personal context through 7 categories and 21 questions.

## Categories (from `src/modules/memory/profile-config.ts`)

| Category | Label | Focus |
|----------|-------|-------|
| `identity` | Identity | What to call you, pronouns, preferred name |
| `communication` | Communication Style | Preferred tone, formality level |
| `expertise` | Expertise | Technical skills, domains |
| `interests` | Interests | Hobbies, topics of interest |
| `work` | Work Context | Job role, projects |
| `learning` | Learning Style | How you prefer explanations to be structured |
| `preferences` | Preferences | UI, AI behavior preferences |

## How It Works

1. User answers profile questions through the settings UI
2. Profile responses become structured memory nodes with origin `profile_setup`
3. These nodes receive a retrieval boost for relevant queries
4. Profile memories are protected from eviction (origin check in `isProtectedMemory`)
5. The profile config is stored in `src/modules/memory/profile-config.ts`

## Profile-Aware Boosting

During memory retrieval, profile-aligned nodes receive extra scoring weight, helping the AI personalize responses based on user context.

---

# memory > 07-types

> Source: `docs/memory/07-types.md`

# Memory Key Types

Accurate as of the current source code (`src/modules/memory/memory-types.ts`).

## Core Types

```typescript
type MemoryMode =
  | "off" | "manual_only" | "safe_auto_save"
  | "review_all" | "aggressive_project_memory";

type MemoryScope = "global" | "project" | "conversation" | "session";

type MemoryPriority = "permanent" | "high" | "medium" | "low" | "ephemeral";

type MemoryStatus =
  | "active" | "needs_review" | "approved" | "rejected" | "archived";

type MemoryRetrievalStatus = "disabled" | "skipped" | "empty" | "used";
```

## MemoryNode

```typescript
interface MemoryNode {
  id: string;
  folderId: string;
  fileId?: string;
  projectId?: string;
  conversationId?: string;
  title: string;
  content: string;
  summary: string;
  type:
    | "preference" | "project" | "project_fact" | "decision"
    | "instruction" | "summary" | "task" | "idea"
    | "file_reference" | "temporary_context";
  scope: MemoryScope;
  tags: string[];
  importance: 1 | 2 | 3 | 4 | 5;
  confidence: number;
  priority: MemoryPriority;
  expiresAt?: string;
  sourceMessageIds: string[];
  extractionBatchId?: string;
  duplicateOf?: string;
  contradictionOf?: string;
  origin:
    | "explicit_user_save" | "auto_extracted"
    | "manual_user_edit" | "imported" | "profile_setup";
  status: MemoryStatus;
  isPinned: boolean;
  userEditable: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  useCount: number;
  relevanceScore?: number;
  vectorScore?: number;
  bm25Score?: number;
  embeddingDim?: number;
}
```

## MemoryFolder / MemoryFile

```typescript
interface MemoryFolder {
  id: string;
  name: string;
  parentId?: string;
  projectId?: string;
  type: "manual" | "project" | "system" | "smart";
  description?: string;
  summary?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface MemoryFile {
  id: string;
  folderId: string;
  projectId?: string;
  title: string;
  slug: string;
  summary: string;
  purpose: string;
  keyPoints: string[];
  status: "active" | "draft" | "needs_review" | "archived";
  tags: string[];
  importance: 1 | 2 | 3 | 4 | 5;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  chunkCount: number;
}
```

## Retrieval & CRUD

```typescript
interface MemoryPack {
  content: string;
  sourceNodeIds: string[];
  sourceFileIds: string[];
  sourceFolderIds: string[];
  tokenCount: number;
  budgetUsed: number;
  reasons: Record<string, string>;
}

interface MemoryRetrievalInfo {
  status: MemoryRetrievalStatus;
  detail: string;
  pack?: MemoryPack;
}

interface MemoryNodeFilter {
  status?: MemoryStatus[];
  scope?: MemoryScope[];
  type?: MemoryNode["type"][];
  folderId?: string;
  fileId?: string;
  projectId?: string;
  isPinned?: boolean;
  origin?: MemoryNode["origin"][];
  query?: string;
  limit?: number;
}

interface CreateMemoryNode { /* mirrors MemoryNode omitting id */ }

interface UpdateMemoryNode {
  id: string;
  /* all MemoryNode fields optional except id */
}

interface MemorySearchOptions {
  limit?: number;
  projectId?: string;
}
```

## Protected Memory

```typescript
function isProtectedMemory(node: {
  isPinned: boolean;
  priority: MemoryPriority;
  importance: number;
  origin: MemoryNode["origin"];
}): boolean
```

Returns `true` for pinned, permanent, importance >= 5, explicit user saves, manual edits, or profile setup nodes.

---

# memory > README

> Source: `docs/memory/README.md`

# Memory Module

Local-first memory system with 5 modes, 10 node types, and AI-powered extraction/retrieval.

## Contents

- [01-modes.md](01-modes.md) — Memory modes (off, manual, auto, etc.)
- [02-node-types.md](02-node-types.md) — Node types, priorities, scopes, protections
- [03-extraction.md](03-extraction.md) — Post-chat memory extraction pipeline
- [04-retrieval.md](04-retrieval.md) — Pre-chat memory retrieval and scoring
- [05-retention.md](05-retention.md) — Eviction and cleanup policies
- [06-profile.md](06-profile.md) — User profile setup (7 categories)
- [07-types.md](07-types.md) — Key type definitions

---

# hooks > 01-overview

> Source: `docs/hooks/01-overview.md`

# Hooks

React hooks used across Veyra's frontend for chat, scheduling, and UI interactions.

## Chat Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useChatSend` | `src/hooks/use-chat-send.ts` | Message send logic |
| `useChatPipeline` | `src/hooks/use-chat-pipeline.ts` | Pipeline lifecycle |
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

# documents > 01-overview

> Source: `docs/documents/01-overview.md`

# Documents Overview

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

## Storage

Documents are stored in SQLite via Tauri IPC. Each document has:
- `id`, `title`, `content`, `type`, `status`
- `conversationId` or `projectId` for scoping
- `versionCount` for version history
- `createdAt`, `updatedAt` timestamps

## Auto-Sync

- Documents sync with the active conversation context
- Documents sync with the active project context
- When switching conversations/projects, the document list updates accordingly

---

# documents > 02-editor

> Source: `docs/documents/02-editor.md`

# Document Editor

## Active Document Draft

- The active document maintains an in-memory draft to avoid remapping on every keystroke
- Draft content is separate from the persisted version
- Draft is reconciled to persistent storage on save

## Auto-Save

- Debounced save (configurable delay) avoids excessive writes
- Each save creates a version snapshot
- Version snapshots track change source: `user`, `assistant`, or `system`

## Export

- Export to **Markdown** (.md) or **Plain Text** (.txt)
- Uses Tauri save dialog for file location selection
- Document content is written directly to the selected file

## Inline AI

The `use-inline-ai.ts` hook provides AI-assisted editing within the document editor, enabling AI completion and suggestions while editing.

---

# documents > 03-tools

> Source: `docs/documents/03-tools.md`

# Document AI Tools

Documents are accessible via 3 chat tools. These tools allow the AI to programmatically read, create, and update documents.

## `doc_read`

Reads a document by ID. Optionally includes version history.

```json
{
  "documentId": "string",
  "includeVersions": false
}
```

## `doc_create`

Creates a new document. Can be scoped to a conversation or project.

```json
{
  "title": "string",
  "content": "string",
  "type": "document",
  "conversationId": "optional",
  "projectId": "optional"
}
```

## `doc_update`

Updates an existing document with selective mutation modes.

```json
{
  "documentId": "string",
  "updateMode": "replace_all | replace_section | insert_after_section | replace_text",
  "targetSection": "optional heading text",
  "newContent": "string"
}
```

## Update Modes

| Mode | Description |
|------|-------------|
| `replace_all` | Replace entire document content |
| `replace_section` | Replace a section by heading |
| `insert_after_section` | Insert content after a section |
| `replace_text` | Replace specific text |

---

# documents > 04-versioning

> Source: `docs/documents/04-versioning.md`

# Document Versioning

Each document maintains a version history that provides undo capability and change tracking.

## Version Snapshots

- Pre/post version snapshots are created for each AI mutation
- Each save creates a new version entry
- Change source is tracked: `user`, `assistant`, or `system`

## Version Record

```typescript
interface DocumentVersion {
  id: string
  documentId: string
  content: string
  changeSource: 'user' | 'assistant' | 'system'
  createdAt: number
}
```

## Undo

The version history enables undo capability for AI edits, allowing users to roll back to previous versions of a document.

---

# documents > 05-types

> Source: `docs/documents/05-types.md`

# Document Key Types

From `src/modules/documents/document-types.ts`:

```typescript
type DocumentType =
  | "document" | "technical_spec" | "essay" | "report"
  | "proposal" | "readme" | "notes" | "prompt"
  | "project_plan" | "meeting_notes" | "research_brief"
  | "agent_instruction";

type DocumentStatus = "draft" | "review" | "final" | "archived";

type UpdateMode =
  | "replace_all" | "replace_section"
  | "insert_after_section" | "replace_text";

type ChangeSource = "user" | "assistant" | "system";

interface DocumentRecord {
  id: string;
  projectId?: string;
  conversationId?: string;
  isGlobal: boolean;
  title: string;
  type: DocumentType;
  status: DocumentStatus;
  editorFormat: string;
  contentMarkdown: string;
  tags: string[];
  folderId?: string;
  createdAt: string;
  updatedAt: string;
  lastExportedAt?: string;
}

interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  contentMarkdown: string;
  changeSource: ChangeSource;
  changeSummary: string;
  sourceConversationId?: string;
  sourceMessageId?: string;
  createdAt: string;
}

interface DocumentFolder {
  id: string;
  name: string;
  parentId?: string;
  projectId?: string;
  sortOrder: number;
}
```

---

# documents > README

> Source: `docs/documents/README.md`

# Documents Module

Markdown document editor with versioning, AI-assisted creation/update, and export.

## Contents

- [01-overview.md](01-overview.md) — Document types, statuses, storage, and sync
- [02-editor.md](02-editor.md) — Editor features, auto-save, export
- [03-tools.md](03-tools.md) — AI document tools (doc_read, doc_create, doc_update)
- [04-versioning.md](04-versioning.md) — Version history and change tracking
- [05-types.md](05-types.md) — Key type definitions

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
- Optional export to Documents or Memory modules

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

Sources are scored on credibility using `src/modules/research/source-credibility.ts` and `src/modules/research/source-quality.ts` considering:
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

Reports can be exported to multiple destinations after the research pipeline completes.

## Export Targets

| Target | Description |
|--------|-------------|
| Documents | Creates a new document with the synthesized report |
| Memory | Extracts key findings as memory nodes |
| File | Direct markdown/text export via the document export system |

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
- [05-report-export.md](05-report-export.md) — Report export to documents, memory, files
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
| `src/modules/web-search/search-ranker.ts` | Result deduplication and ranking |
| `src/modules/web-search/searxng-setup.ts` | Docker setup for SearXNG |
| `src/modules/web-search/providers/` | Provider implementations |
| `src/modules/web-search/tauri-commands.ts` | Tauri IPC for page fetching |

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
- Each query hits the SearXNG API
- Results are collected and merged

## Deduplication and Ranking

`search-ranker.ts` handles:
- URL-based deduplication
- Relevance ranking against the original query
- Source diversity encouragement

## Page Fetching

- Top results are fetched via Tauri IPC
- Content is extracted from HTML
- Fetch status is tracked per result

## Context Bundle

Returns a `SearchContextBundle` containing:
- `sources` — Array of search results with metadata
- `summaries` — Page content summaries
- `diagnostics` — Timing and error info

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
- General web search queries
- Date-filtered searches for recency
- Result parsing and normalization

## ArXiv Provider

Direct API access for academic paper searches. Returns paper metadata with links.

## Wikipedia Provider

Direct API access for encyclopedia searches. Returns article summaries and links.

---

# web-search > 04-integration

> Source: `docs/web-search/04-integration.md`

# Web Search Integration

## Chat Tool Integration

In chat, the `web_search` tool triggers search:

```json
{
  "query": "string",
  "numResults": 5
}
```

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
interface SearchProvider {
  id: string;
  name: string;
  type: "searxng" | "brave" | "custom" | "direct_source";
  search(input: SearchInput): Promise<SearchResult[]>;
  testConnection?(): Promise<boolean>;
}

type SearchInput = {
  query: string;
  limit?: number;
  language?: string;
  categories?: string;
  timeRange?: string;
  safeSearch?: number;
};

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
    freshnessBoosted?: boolean;
    qualityFiltered?: boolean;
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

Persistent local containers that scope chats, documents, memories, tools, and settings around a goal or workstream.

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
| `memoryEnabled` | `boolean` | Enable/disable memory for this project |
| `memoryMode` | `MemoryMode` | Override memory mode |
| `webSearchEnabled` | `boolean` | Enable/disable web search |
| `webSearchMode` | `"auto" \| "always" \| "off"` | Override web search mode |
| `webSearchFetchEnabled` | `boolean` | Enable content fetching for search results |
| `webSearchFetchCount` | `number` | Max pages to fetch per search |
| `webSearchPerPageTimeoutSecs` | `number` | Per-page fetch timeout |
| `webSearchFetchMaxCharsPerSource` | `number` | Max characters extracted per source |
| `webSearchContextTokenLimit` | `number` | Token budget for search context |
| `enabledTools` | `{ documents: boolean; webSearch: boolean }` | Which tools are available |
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
- **Documents**: Documents can be project-specific
- **Memory**: Memory nodes can be project-scoped

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
  memoryEnabled?: boolean;
  memoryMode?: MemoryMode;
  webSearchEnabled?: boolean;
  webSearchMode?: "auto" | "always" | "off";
  webSearchFetchEnabled?: boolean;
  webSearchFetchCount?: number;
  webSearchPerPageTimeoutSecs?: number;
  webSearchFetchMaxCharsPerSource?: number;
  webSearchContextTokenLimit?: number;
  enabledTools?: {
    documents: boolean;
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

Persistent local containers that scope chats, documents, memories, tools, and settings.

## Contents

- [01-overview.md](01-overview.md) — Project kinds, statuses, fields
- [02-settings.md](02-settings.md) — Per-project settings overrides
- [03-architecture.md](03-architecture.md) — Activation, context injection, scoped resources
- [04-types.md](04-types.md) — Key type definitions

---

# email > 01-setup

> Source: `docs/email/01-setup.md`

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

---

# email > 02-features

> Source: `docs/email/02-features.md`

# Email Features

## Thread Viewing

- List threads by folder (Inbox, Drafts, Sent, etc.)
- Thread-based email model with participants
- Message history within threads
- Search across threads

## Compose and Send

- New message composition
- Fields: To, CC, BCC, Subject, Body
- Save as draft
- Send via SMTP

## Thread Operations

| Operation | Description |
|-----------|-------------|
| Archive | Move thread to archive |
| Mark Read | Mark thread as read |
| Mark Unread | Mark thread as unread |

## Folder Browsing

- Browse email folders
- Standard folders: Inbox, Sent, Drafts, Archive, Trash
- Custom folder support

## Sync

- Manual sync trigger
- Account-level sync status
- Error handling for sync failures

## AI Features

- `use-email-ai-dashboard.ts`: AI-powered email dashboard
- `email-ai-worker.ts`: Background AI email processing
- `email-ai-prompts.ts`: AI prompt templates for email tasks
- `email-ai-coverage.ts`: Email AI feature detection
- `email-ai-scheduler-sync.ts`: AI job scheduling integration

---

# email > 03-tauri-commands

> Source: `docs/email/03-tauri-commands.md`

# Email Tauri IPC Commands

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

# email > 04-types

> Source: `docs/email/04-types.md`

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

---

# email > README

> Source: `docs/email/README.md`

# Email Module

Email client with Gmail OAuth and IMAP support.

## Contents

- [01-setup.md](01-setup.md) — Providers, OAuth, IMAP configuration
- [02-features.md](02-features.md) — Thread viewing, compose, folders, sync, AI features
- [03-tauri-commands.md](03-tauri-commands.md) — Tauri IPC commands
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

# Agent Session Management

## Persistence

- Sessions are persisted to localStorage (excluding running sessions)
- Running sessions are not persisted (they can't survive app restart)

## Concurrency

- Max **1 running session per project path**
- `chainedStart` prevents concurrent starts for the same workspace
- Starting a new session in the same project stops the previous one

## Operations

| Operation | Description |
|-----------|-------------|
| Start | Create and run a new session |
| Stop | Abort a running session |
| Delete | Remove a session |
| Clear | Clear all sessions |

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

# Agent UI Components

## Agents Panel

- Mode selector (Plan/Build)
- Workspace path input with folder browser
- Runtime status pill (available/unavailable)
- Session list sidebar
- Output view with live streaming

## Output View

- Typewriter-style markdown rendering
- Expandable reasoning blocks
- Tool call indicators
- Error display

## Key Components

| Component | Purpose |
|-----------|---------|
| `agents-panel.tsx` | Main agents panel with mode selection and session management |
| `agent-output-view.tsx` | Live streaming output display |
| `agent-session-list.tsx` | Session sidebar with history |
| `typewriter-markdown.tsx` | Typewriter markdown rendering |

---

# agents > 05-tauri-commands

> Source: `docs/agents/05-tauri-commands.md`

# Agents Tauri IPC Commands

| Command | Description |
|---------|-------------|
| `check_pi_available` | Check if Pi CLI is on PATH |
| `list_pi_sessions` | List Pi sessions |
| `switch_pi_session` | Switch active session |
| `delete_pi_session` | Delete a session |
| `stop_pi_agent` | Stop a running agent |
| `run_pi_agent` | Start an agent run (streams events) |

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

Python code execution sandbox via Tauri backend. Used by the `code_execution` chat tool.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/code-execution.ts` | Frontend types and Tauri invoke wrappers |
| `src-tauri/src/code_execution/` | Rust backend: Python sandbox |

## Python Availability Check

```typescript
type PythonAvailabilityResult = {
  available: boolean;
  resolvedPath: string | null;
  source: string | null;
  version: string | null;
  message: string | null;
};
```

Detects Python installation on the system. If Python is unavailable, the `code_execution` tool is disabled.

## Execution

```typescript
type PythonExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  pythonPath: string;
  durationMs: number;
  workingDirectory: string;
};
```

Code is executed in a temporary working directory with configurable timeout. The tool returns stdout, stderr, exit code, and duration.

## Safety

- Code execution requires Python to be installed
- The tool is disabled-safe if Python is unavailable
- Configurable timeout prevents runaway code
- Executes in a sandboxed temporary directory

---

# code-execution > README

> Source: `docs/code-execution/README.md`

# Code Execution

Python code execution sandbox used by the `code_execution` chat tool.

## Contents

- [01-overview.md](01-overview.md) — Code execution system and types

---

# architecture > 01-state-management

> Source: `docs/architecture/01-state-management.md`

# State Management

Cross-cutting architecture patterns for state management.

## Key Files

| File | Purpose |
|------|---------|
| `src/stores/chat-store.ts` | Central conversation state |
| `src/stores/settings-store.ts` | Combined settings (12 slices) |
| `src/stores/provider-store.ts` | Provider and model management |
| `src/stores/connectivity-store.ts` | Connectivity state |
| `src/stores/update-store.ts` | App update state |

## Zustand Stores (14 total)

Stores live in both `src/stores/` and `src/modules/<feature>/`:

| Store Hook | Location | Purpose |
|------------|----------|---------|
| `useChatStore` | `src/stores/chat-store.ts` | Conversations, streaming buffer, messages |
| `useSettingsStore` | `src/stores/settings-store.ts` | All app settings (12 slices) |
| `useProviderStore` | `src/stores/provider-store.ts` | Provider connection, model listing |
| `useConnectivityStore` | `src/stores/connectivity-store.ts` | Online/offline/local-only state |
| `useUpdateStore` | `src/stores/update-store.ts` | App update state |
| `useMemoryStore` | `src/modules/memory/memory-store.ts` | Memory nodes, folders, files |
| `useDocumentStore` | `src/modules/documents/document-store.ts` | Documents with auto-save |
| `useCharacterStore` | `src/modules/characters/character-store.ts` | Character records |
| `useCharacterGroupStore` | `src/modules/characters/character-group-store.ts` | Character groups |
| `useCharacterAssistStore` | `src/modules/characters/ai-assist/ai-assist-store.ts` | AI-assisted creation state |
| `useProjectStore` | `src/modules/projects/project-store.ts` | Projects |
| `useResearchStore` | `src/modules/research/research-store.ts` | Research runs and reports |
| `useEmailStore` | `src/modules/email/email-store.ts` | Email accounts and threads |
| `useAgentStore` | `src/modules/agents/agent-store.ts` | Agent sessions |

## Settings Store (12 Slices)

The settings store is composed from 12 slices in `src/stores/slices/`:

| Slice | File | Purpose |
|-------|------|---------|
| `ui-layout-slice` | `ui-layout-slice.ts` | Active nav, panel collapsed state, visible tool settings |
| `model-slice` | `model-slice.ts` | Default model, temperature, context length |
| `memory-slice` | `memory-slice.ts` | Memory mode, scope limits |
| `web-search-slice` | `web-search-slice.ts` | SearXNG URL, provider settings |
| `document-slice` | `document-slice.ts` | Auto-save delay, default type |
| `character-slice` | `character-slice.ts` | AI assist model, max tokens, tone settings |
| `research-slice` | `research-slice.ts` | Default depth, approval requirements |
| `code-execution-slice` | `code-execution-slice.ts` | Python path, timeout |
| `connectivity-slice` | `connectivity-slice.ts` | Online/offline preference |
| `chat-slice` | `chat-slice.ts` | Workspace mode, context anchoring, enhanced mode |
| `email-ai-slice` | `email-ai-slice.ts` | Auto-draft, classification, spam scoring, urgency |
| `update-slice` | `update-slice.ts` | Auto-check updates, dismissed version |

All settings persist to localStorage under `veyra.settings.v1`.

---

# architecture > 02-ai-scheduler

> Source: `docs/architecture/02-ai-scheduler.md`

# AI Job Scheduler

Central scheduler (`src/lib/ai-scheduler.ts`) manages all AI tasks with priority-based queueing.

## Job Types (14 total)

| Type | Priority | Description |
|------|----------|-------------|
| `user_chat` | 0 (highest) | User chat requests |
| `agent_pi` | 1 | Pi CLI agent runs |
| `research_run` | 1 | Research pipeline execution |
| `auto_name_chat` | 2 | Auto-generate conversation titles |
| `character_ai_assist` | 2 | AI-assisted character creation |
| `summarize_chat` | 3 | Conversation summarization |
| `extract_memory` | 3 | Memory extraction from chat |
| `compress_context` | 3 | Context compression |
| `email_thread_summary` | 3 | Email thread summarization |
| `email_classification` | 3 | Email classification |
| `email_spam_score` | 3 | Email spam scoring |
| `email_urgency_score` | 3 | Email urgency scoring |
| `email_reply_draft` | 3 | Email reply draft generation |
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

The system prompt is assembled from ~10 XML-tagged blocks. Each block is conditionally included based on the current state.

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

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/prompts.ts` | Prompt construction and assembly |
| `src/modules/chat/chat-context-builder.ts` | Context block assembly |

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
| `code_execution` | `codeExecutionEnabled` | Run Python code in a sandboxed temp directory. |
| `doc_create` | `documentToolsEnabled` | Create a new document. |
| `doc_read` | `documentToolsEnabled` | Read a document by ID. |
| `inline_edit` | `documentToolsEnabled` | Edit a document (replace_all, replace_section, insert_after_section, replace_text). Retries up to 2 times with LLM re-prompt. |
| `scratchpad_write` | `enhancedMode` | Persistent working notes across tool rounds. |
| `ask_question` | `enhancedMode` | Pause execution to ask the user a question. |

Each tool has a JSON schema defining its parameters. Tool calls execute in rounds:
- Standard mode: up to **6 rounds**
- Enhanced mode: up to **10 rounds**

`doc_update` is a legacy constant kept for backward-compatible runtime handling; it has been replaced by `inline_edit`.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/tool-registry.ts` | Tool definitions for LLM (JSON Schema) |
| `src/lib/tool-call-ui.ts` | UI rendering for tool calls |
| `src/modules/chat/chat-tool-rounds.ts` | Tool call execution engine |
| `src/modules/chat/chat-tool-utils.ts` | Tool utility functions |
| `src/modules/chat/chat-tool-loop.ts` | Tool loop iteration control |
| `src/modules/chat/tools/` | Individual tool implementations |

---

# architecture > 06-encrypted-storage

> Source: `docs/architecture/06-encrypted-storage.md`

# Encrypted Storage

## Conversation Encryption

- AES-GCM encryption for conversation files
- Encryption keys managed by the Rust backend
- Web Workers handle encryption/decryption without blocking the UI
- Debounced saves (500ms) to avoid excessive I/O

## Key Management

- Keys are stored securely via Tauri
- Legacy key migration on startup
- Key rotation support

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/conversation-storage.ts` | Encrypted conversation persistence |
| `src/lib/document-storage.ts` | Document storage abstraction |

---

# architecture > 07-backend

> Source: `docs/architecture/07-backend.md`

# Tauri Backend

## Rust Modules (13 total)

| Module | Purpose |
|--------|---------|
| `agents/` | Pi CLI integration |
| `characters/` | Character and group CRUD, I/O commands, avatar management |
| `code_execution/` | Python sandbox (check + execute) |
| `connectivity/` | Network connectivity probe |
| `document_extraction` | Document text extraction utility |
| `documents/` | Document CRUD, versions, export, folders |
| `email/` | Gmail OAuth, IMAP, AI jobs, drafts, tags |
| `file_extraction/` | PDF, DOCX, PPTX, XLSX extraction |
| `memory/` | Memory CRUD, BM25 + vector search, embeddings |
| `projects/` | Project CRUD, manifest export |
| `research/` | Research run, step, source, evidence, claim, contradiction, report CRUD |
| `shared/` | SQLite connection, migrations, encryption keys |
| `web_search/` | SearXNG Docker management, page fetching |

## Command Count

**~140 Tauri commands** registered across all modules. Key counts:
- Agents: 6 commands
- Code execution: 2 commands
- Memory: 14 commands
- Connectivity: 1 command
- Web search: 9 commands
- Documents: 16 commands
- Email: 47 commands
- Projects: 6 commands
- Research: 16 commands
- Characters: 18 commands
- File extraction: 1 command
- Core (conversations, credentials, app lifecycle): 9 commands

## Storage

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

