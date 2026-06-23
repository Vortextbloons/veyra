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
