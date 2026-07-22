import { invoke } from "@tauri-apps/api/core";
import type { ProviderToolDefinition } from "@/lib/providers/types";
import type { McpServerRecord } from "./extension-types";

type CatalogTool = { name?: unknown; description?: unknown; inputSchema?: unknown };

export function mcpProviderToolName(serverId: string, toolName: string): string {
  return `mcp_${serverId.replace(/[^a-zA-Z0-9_]/g, "_")}_${toolName.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

export function mcpCapabilityId(serverId: string, toolName: string): string {
  return `mcp.${serverId}.${toolName}`;
}

function toolsFor(server: McpServerRecord): CatalogTool[] {
  return Array.isArray(server.capabilities?.tools) ? server.capabilities.tools as CatalogTool[] : [];
}

export function buildMcpProviderTools(servers: McpServerRecord[], projectId?: string, flags: { mcp: boolean; stdio: boolean; streamableHttp: boolean } = { mcp: true, stdio: true, streamableHttp: true }, disabledServerIds: string[] = [], enabledServerIds: string[] = []): ProviderToolDefinition[] {
  if (!flags.mcp) return [];
  return servers
    .filter((server) => !disabledServerIds.includes(server.id) && (server.enabled || enabledServerIds.includes(server.id)) && server.health === "ready" && (server.transport === "stdio" ? flags.stdio : flags.streamableHttp) && (!projectId || server.projectIds.length === 0 || server.projectIds.includes(projectId)))
    .flatMap((server) => toolsFor(server).flatMap((tool) => {
      if (typeof tool.name !== "string" || !tool.name) return [];
      return [{
        type: "function" as const,
        function: {
          name: mcpProviderToolName(server.id, tool.name),
          description: `[MCP: ${server.name}] ${typeof tool.description === "string" ? tool.description : "External capability."}`,
          parameters: typeof tool.inputSchema === "object" && tool.inputSchema ? tool.inputSchema as Record<string, unknown> : { type: "object", properties: {} },
        },
      }];
    }));
}

export function resolveMcpTool(servers: McpServerRecord[], name: string): { server: McpServerRecord; toolName: string } | undefined {
  for (const server of servers) for (const tool of toolsFor(server)) if (typeof tool.name === "string" && mcpProviderToolName(server.id, tool.name) === name) return { server, toolName: tool.name };
  return undefined;
}

export async function invokeMcpTool(server: McpServerRecord, toolName: string, arguments_: Record<string, unknown>): Promise<unknown> {
  if (server.transport === "streamable_http" && server.endpoint) return invoke("call_streamable_http_mcp", { endpoint: server.endpoint, toolName, arguments: arguments_, timeoutMs: server.timeoutMs });
  if (server.transport === "stdio" && server.executable) return invoke("call_stdio_mcp", { executable: server.executable, arguments: server.arguments ?? [], workingDirectory: server.workingDirectory ?? null, toolName, toolArguments: arguments_, timeoutMs: server.timeoutMs });
  throw new Error("This MCP transport is not ready for tool calls.");
}
