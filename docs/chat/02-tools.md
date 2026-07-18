# Chat Tools

If the model returns tool calls, they are executed in rounds with re-prompting after each round. Standard mode allows up to 6 rounds; enhanced mode allows up to 10.

## Registered Tools

| Tool | Required Flag | Description |
|------|--------------|-------------|
| `web_search` | `webSearchEnabled` | Search the web via SearXNG with intent routing, time range, language, safe search, and pagination parameters |
| `code_execution` | Disabled | Reserved for a future OS-enforced sandbox |
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
- `doc_create` calls are deduplicated within a single tool round — repeated create requests with identical arguments are skipped
- `doc_update` is a legacy constant kept for backward-compatible runtime handling; it has been replaced by `inline_edit`

## Tool Registry

Tools are registered in `src/lib/tool-registry.ts` with JSON Schema definitions. Each tool specifies:
- Name and description
- Parameter schema (JSON Schema format)
- Required state flags (web search must be enabled, etc.)
