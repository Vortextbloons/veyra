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
