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
