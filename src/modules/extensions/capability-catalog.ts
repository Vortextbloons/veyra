import type { McpServerRecord, SkillRecord } from "./extension-types";

export type SideEffectLevel = "read" | "local_write" | "external_write" | "destructive";
export type ToolCapability = { kind: "tool"; id: string; serverId: string; name: string; description: string; inputSchema: Record<string, unknown>; outputSchema?: Record<string, unknown>; sideEffect: SideEffectLevel };
export type ResourceCapability = { kind: "resource"; id: string; serverId: string; uri: string; name: string; mimeType?: string; estimatedBytes?: number };
export type PromptCapability = { kind: "prompt"; id: string; serverId: string; name: string; description: string; arguments: unknown[] };
export type WorkflowCapability = { kind: "workflow"; id: string; skillId: string; workflowId: string; name: string };
export type Capability = ToolCapability | ResourceCapability | PromptCapability | WorkflowCapability;

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function text(value: unknown, fallback = ""): string { return typeof value === "string" ? value : fallback; }

export function classifyMcpTool(tool: Record<string, unknown>): SideEffectLevel {
  const hint = object(tool.annotations).destructiveHint;
  if (hint === true) return "destructive";
  const haystack = `${text(tool.name)} ${text(tool.description)}`.toLowerCase();
  if (/\b(delete|destroy|drop|remove|terminate|reset|wipe)\b/.test(haystack)) return "destructive";
  if (/\b(write|create|update|edit|send|publish|deploy|merge|invite)\b/.test(haystack)) return "external_write";
  return "external_write";
}

export function buildCapabilityCatalog(servers: McpServerRecord[], skills: SkillRecord[]): Capability[] {
  const capabilities: Capability[] = [];
  for (const server of servers) {
    for (const raw of server.capabilities?.tools ?? []) { const tool = object(raw); const name = text(tool.name); if (name) capabilities.push({ kind: "tool", id: `mcp.${server.id}.${name}`, serverId: server.id, name, description: text(tool.description), inputSchema: object(tool.inputSchema), sideEffect: classifyMcpTool(tool) }); }
    for (const raw of server.capabilities?.resources ?? []) { const resource = object(raw); const uri = text(resource.uri); if (uri) capabilities.push({ kind: "resource", id: `mcp.${server.id}.resource.${encodeURIComponent(uri)}`, serverId: server.id, uri, name: text(resource.name, uri), mimeType: text(resource.mimeType) || undefined, estimatedBytes: typeof resource.size === "number" ? resource.size : undefined }); }
    for (const raw of server.capabilities?.prompts ?? []) { const prompt = object(raw); const name = text(prompt.name); if (name) capabilities.push({ kind: "prompt", id: `mcp.${server.id}.prompt.${name}`, serverId: server.id, name, description: text(prompt.description), arguments: Array.isArray(prompt.arguments) ? prompt.arguments : [] }); }
  }
  for (const skill of skills) for (const workflow of skill.workflows) capabilities.push({ kind: "workflow", id: `skill.${skill.id}.${workflow.id}`, skillId: skill.id, workflowId: workflow.id, name: workflow.name });
  return capabilities;
}
