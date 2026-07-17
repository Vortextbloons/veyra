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
