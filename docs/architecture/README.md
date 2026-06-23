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
