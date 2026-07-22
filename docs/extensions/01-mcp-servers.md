# MCP Servers

Veyra integrates MCP servers via the `rmcp` Rust SDK. Two transports are supported:

- **Streamable HTTP** — Remote MCP servers over HTTP. Non-localhost endpoints require HTTPS.
- **stdio** — Local child processes spawned by Veyra. Never invoked through a shell.

## Key Files

| File | Purpose |
|------|---------|
| `src-tauri/src/extensions/commands.rs` | All Tauri MCP commands (discovery, tool call, resource read, prompt fetch) |
| `src/modules/extensions/mcp-tool-adapter.ts` | Frontend adapter: tool name resolution, invocation routing |
| `src/modules/extensions/extension-types.ts` | `McpServerRecord`, `McpTransport`, `CapabilityGrant`, `PermissionCategory` |
| `src/modules/extensions/extensions-store.ts` | Zustand store with persistence for servers, grants, diagnostics |
| `src/modules/extensions/capability-catalog.ts` | Classifies MCP tool side effects, builds unified capability catalog |
| `src/modules/extensions/components/mcp-server-settings.tsx` | Settings UI: add, connect, inspect, grant permissions |
| `src/modules/extensions/components/mcp-chat-toggle.tsx` | Per-chat MCP server enable/disable toggle in composer |

## Tauri Commands

| Command | Purpose |
|---------|---------|
| `discover_streamable_http_mcp` | Connects to an HTTP MCP endpoint and discovers tools/resources/prompts |
| `discover_stdio_mcp` | Starts a stdio MCP process and discovers capabilities |
| `call_streamable_http_mcp` | Calls a tool on a remote MCP server |
| `call_stdio_mcp` | Calls a tool on a local stdio MCP server |
| `read_streamable_http_mcp_resource` | Reads a resource from a remote MCP server |
| `read_stdio_mcp_resource` | Reads a resource from a local stdio MCP server |
| `get_streamable_http_mcp_prompt` | Retrieves a prompt template from a remote MCP server |
| `get_stdio_mcp_prompt` | Retrieves a prompt template from a local stdio MCP server |

All connections are one-shot: the SDK client connects, performs the operation, and closes. Persistent sessions are not managed by Veyra.

## Capability Discovery

When a server is saved and enabled, `connect()` runs the appropriate discovery command. The result is stored in the `McpServerRecord.capabilities` field as a fingerprint. A changed fingerprint invalidates prior capability grants.

## Permission Model

MCP tool calls require explicit approval before execution. Grants are stored in the extensions store with the following scopes:

| Scope | Behavior |
|-------|----------|
| `once` | Single-use, expires after 5 minutes |
| `chat` | Allowed for the duration of the current chat |
| `project` | Allowed for the current project |
| `all` | Allows all non-destructive tools from the server |

Destructive tools (delete, destroy, drop, remove, terminate, reset, wipe) always require a fresh one-time approval. Approvals are tied to the server's capability fingerprint and are revoked automatically when the fingerprint changes.

## Safety Controls

The extensions settings page exposes four feature flags that can disable entire categories:

| Flag | Effect |
|------|--------|
| `skills` | Disables all skill context injection |
| `mcp` | Disables all MCP execution |
| `stdio` | Disables local stdio-based MCP servers |
| `streamableHttp` | Disables remote Streamable HTTP MCP servers |

MCP servers are off by default for each chat. The user must explicitly enable a server in the `McpChatToggle` component before the model can call its tools.
