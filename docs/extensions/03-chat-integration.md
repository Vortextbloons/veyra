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
const contextualPrompt = [projectGuidance, buildSkillPromptBlock(invocations), userPrompt]
  .filter(Boolean).join("\n\n");
```

The recorded instructions are sent with the user prompt (after project guidance),
so the block that runs belongs to that request rather than to whatever the
library holds now. See [Skills](02-skills.md) for the materialize step that gives
Pi a resolvable directory for supporting files.

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
  └─ buildMcpProviderTools → tool definitions

Retry on a user turn
  └─ agent-store retryRequest → replays the stored invocation record

Tool execution
  └─ executeToolRound → mcpCalls → resolveMcpTool → grant check → invokeMcpTool
```
