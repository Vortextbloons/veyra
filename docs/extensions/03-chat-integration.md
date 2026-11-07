# Chat Integration

Extensions integrate into the chat pipeline at three points: tool registration, tool execution, and context injection.

## Tool Registration

In `src/modules/chat/chat-provider-options.ts`, `resolveProviderTooling()` appends MCP tools to the provider's tool list:

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

`src/modules/agents/agent-store.ts` resolves the active skill when it starts a
session:

```typescript
const selectedSkill = extensions.resolveActiveSkillSelection(scopeId, scopeProjectId);
const contextualPrompt = [
  project?.systemPrompt ? `Project guidance:
${project.systemPrompt}` : "",
  selectedSkill ? buildSkillContext(selectedSkill.skill, selectedSkill.workflowId) : "",
  userPrompt,
].filter(Boolean).join("

");
```

The skill block is prepended to the user prompt (after project guidance), so it
reaches Pi together with the turn it applies to.

## UI Components

| Component | Location | Role |
|-----------|----------|------|
| `ChatExtensionsSettings` | Chat options menu | Select the active skill or workflow and enable/disable MCP servers for the current chat |
| `ExtensionsSettings` | Settings → Extensions | Full skill and MCP server management |
| `McpServerSettings` | Settings → Extensions | Add, inspect, connect, and grant MCP permissions |

## Data Flow

```
Settings page
  ├─ Import / generate skill → extensions-store (persisted)
  ├─ Add MCP server → Tauri discovery command → extensions-store
  └─ Grant permissions → extensions-store

Chat options menu
  └─ ChatExtensionsSettings → activeSkillId / chatDisabledMcpServerIds → extensions-store

Send message
  └─ useChatSend → attaches skillSnapshot to user message

Chat orchestrator
  ├─ resolveActiveSkillSelection → buildSkillContext → system prompt
  └─ resolveProviderTooling → buildMcpProviderTools → tool definitions

Tool execution
  └─ executeToolRound → mcpCalls → resolveMcpTool → grant check → invokeMcpTool
```
