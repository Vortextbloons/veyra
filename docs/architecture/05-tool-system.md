# Tool System

## Registered Tools

| Tool | Condition | Description |
|------|-----------|-------------|
| `web_search` | `webSearchEnabled` | Search the web via SearXNG. Parallel execution with up to 2 retries. |
| `doc_create` | `documentToolsEnabled` | Create a new document. |
| `doc_read` | `documentToolsEnabled` | Read a document by ID. |
| `inline_edit` | `documentToolsEnabled` | Edit a document (replace_all, replace_section, insert_after_section, replace_text). Retries up to 2 times with LLM re-prompt. |
| `scratchpad_write` | `enhancedMode` | Persistent working notes across tool rounds. |
| `ask_question` | `enhancedMode` | Pause execution to ask the user a question. |
| `studio_render` | `studioEnabled` | Render a validated HTML/CSS Studio response in an isolated iframe. |
| `studio_theme` | `studioEnabled` | Restyle the chat panel, messages, and composer via vibe or complete palette. |

Each tool has a JSON schema defining its parameters. Tool calls execute in rounds:
- Standard mode: up to **6 rounds**
- Enhanced mode: up to **10 rounds**

`doc_update` is a legacy constant kept for backward-compatible runtime handling; it has been replaced by `inline_edit`.

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
