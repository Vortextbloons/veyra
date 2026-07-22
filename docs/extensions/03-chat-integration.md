# Chat Integration

Extensions integrate into the chat pipeline at three points: tool registration, tool execution, and context injection.

## Tool Registration

In `src/modules/chat/chat-provider-options.ts`, `resolveProviderTooling()` appends MCP tools to the provider's tool list:

```typescript
buildMcpProviderTools(extensions.mcpServers, projectId, featureFlags, disabledServerIds)
```

Each MCP tool is namespaced as `mcp_<serverId>_<toolName>` to avoid collisions. The tool description is prefixed with `[MCP: <server name>]`.

## Tool Execution

In `src/modules/chat/chat-tool-rounds.ts`, `executeToolRound()` routes any tool call starting with `mcp_` through the MCP adapter:

1. **Resolve** — Match the tool name to an `McpServerRecord` and tool name.
2. **Gate** — Check chat-level enable, server health, project scope, and transport feature flags.
3. **Permission** — Require a `CapabilityGrant` via `findCapabilityGrant`. Destructive tools always need a fresh one-time approval.
4. **Invoke** — Call `invokeMcpTool` which dispatches to the appropriate Tauri command.
5. **Format** — Cap output at 60 KB to prevent context flooding.

Tool call results are rendered in the chat UI's tool call indicators, with `mcpApproval` metadata for permission requests.

## Skill Context Injection

In `src/modules/chat/chat-orchestrator.ts`, `sendChatRequest()` resolves the active skill:

```typescript
const activeSkill = extensionState.resolveActiveSkillSelection(conversationId, projectId);
const skillContextBlock = activeSkill ? buildSkillContext(activeSkill.skill, activeSkill.workflowId) : undefined;
```

The resulting `<veyra_active_skill>` XML block is added to the system prompt alongside other context blocks.

## UI Components

| Component | Location | Role |
|-----------|----------|------|
| `SkillSelector` | Composer toolbar | Select an active skill or workflow per chat |
| `McpChatToggle` | Composer toolbar | Enable/disable MCP servers for the current chat |
| `ProjectSkillsSettings` | Project settings | Restrict skills and MCP servers per project |
| `ExtensionsSettings` | Settings → Extensions | Full skill and MCP server management |
| `McpServerSettings` | Settings → Extensions | Add, inspect, connect, and grant MCP permissions |

## Data Flow

```
Settings page
  ├─ Import / generate skill → extensions-store (persisted)
  ├─ Add MCP server → Tauri discovery command → extensions-store
  └─ Grant permissions → extensions-store

Composer toolbar
  ├─ SkillSelector → activeSkillId → extensions-store
  └─ McpChatToggle → chatDisabledMcpServerIds → extensions-store

Send message
  └─ useChatSend → attaches skillSnapshot to user message

Chat orchestrator
  ├─ resolveActiveSkillSelection → buildSkillContext → system prompt
  └─ resolveProviderTooling → buildMcpProviderTools → tool definitions

Tool execution
  └─ executeToolRound → mcpCalls → resolveMcpTool → grant check → invokeMcpTool
```
