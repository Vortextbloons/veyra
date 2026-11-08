import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CapabilityGrant, ExtensionDiagnostic, McpServerRecord, ProjectExtensionPolicy } from "./extension-types";
import { stashLegacySkills } from "./skills-migration";

/**
 * MCP servers, capability approvals, and diagnostics. Skills live in
 * `skills-store.ts` because they are edited as documents and selected per
 * request, which is a different lifecycle from a long-lived server process.
 */
type ExtensionsStore = {
  featureFlags: { mcp: boolean; stdio: boolean; streamableHttp: boolean };
  mcpServers: McpServerRecord[];
  grants: CapabilityGrant[];
  diagnostics: ExtensionDiagnostic[];
  policies: Record<string, ProjectExtensionPolicy>;
  chatDisabledMcpServerIds: Record<string, string[]>;
  chatEnabledMcpServerIds: Record<string, string[]>;
  saveMcpServer: (server: McpServerRecord) => void;
  removeMcpServer: (id: string) => void;
  setMcpDiscovery: (id: string, result: { tools?: unknown[]; resources?: unknown[]; prompts?: unknown[] }) => void;
  addGrant: (grant: Omit<CapabilityGrant, "id" | "createdAt">) => void;
  revokeGrant: (id: string) => void;
  consumeGrant: (id: string) => void;
  addDiagnostic: (diagnostic: Omit<ExtensionDiagnostic, "id" | "createdAt">) => void;
  clearDiagnostics: (source?: string) => void;
  setProjectPolicy: (projectId: string, policy: Partial<ProjectExtensionPolicy>) => void;
  setFeatureFlag: (flag: "mcp" | "stdio" | "streamableHttp", enabled: boolean) => void;
  setChatMcpEnabled: (chatId: string, serverId: string, enabled: boolean) => void;
};

const DEFAULT_POLICY: ProjectExtensionPolicy = {
  enabledSkillIds: [], enabledMcpServerIds: [], disabledCapabilityIds: [],
};

function fingerprint(result: { tools?: unknown[]; resources?: unknown[]; prompts?: unknown[] }): string {
  return JSON.stringify({ tools: result.tools ?? [], resources: result.resources ?? [], prompts: result.prompts ?? [] });
}

/** A deny is always stronger than an allow; expired and revoked grants are inert. */
export function findCapabilityGrant(grants: CapabilityGrant[], input: { serverId: string; capabilityId: string; projectId?: string; chatId?: string; capabilityFingerprint?: string }): CapabilityGrant | undefined {
  const applicable = grants.filter((grant) =>
    grant.serverId === input.serverId &&
    (grant.capabilityId === input.capabilityId || grant.capabilityId === "*") &&
    !grant.revokedAt &&
    (!grant.expiresAt || Date.parse(grant.expiresAt) > Date.now()) &&
    (!grant.projectId || grant.projectId === input.projectId) &&
    (!grant.chatId || grant.chatId === input.chatId) &&
    (grant.usesRemaining === undefined || grant.usesRemaining > 0) &&
    (!grant.capabilityFingerprint || grant.capabilityFingerprint === input.capabilityFingerprint),
  );
  if (applicable.some((grant) => grant.decision === "deny")) return undefined;
  return applicable.find((grant) => grant.decision === "allow");
}

export function hasCapabilityGrant(grants: CapabilityGrant[], input: { serverId: string; capabilityId: string; projectId?: string; chatId?: string; capabilityFingerprint?: string }): boolean {
  return Boolean(findCapabilityGrant(grants, input));
}

export function isMcpEnabledForChat(server: McpServerRecord, disabledIds: string[] | undefined, enabledIds: string[] | undefined): boolean {
  if (disabledIds?.includes(server.id)) return false;
  return server.enabled || Boolean(enabledIds?.includes(server.id));
}

export const useExtensionsStore = create<ExtensionsStore>()(persist((set) => ({
  featureFlags: { mcp: true, stdio: true, streamableHttp: true },
  mcpServers: [], grants: [], diagnostics: [], policies: {}, chatDisabledMcpServerIds: {}, chatEnabledMcpServerIds: {},
  saveMcpServer: (server) => set((state) => ({ mcpServers: state.mcpServers.some((item) => item.id === server.id) ? state.mcpServers.map((item) => item.id === server.id ? server : item) : [...state.mcpServers, server] })),
  removeMcpServer: (id) => set((state) => ({ mcpServers: state.mcpServers.filter((server) => server.id !== id), grants: state.grants.filter((grant) => grant.serverId !== id) })),
  setMcpDiscovery: (id, result) => set((state) => {
    const capabilityFingerprint = fingerprint(result);
    const changed = state.mcpServers.some((server) => server.id === id && Boolean(server.capabilityFingerprint) && server.capabilityFingerprint !== capabilityFingerprint);
    return {
      mcpServers: state.mcpServers.map((server) => server.id !== id ? server : { ...server, health: "ready", lastError: undefined, lastConnectedAt: new Date().toISOString(), capabilityFingerprint, capabilities: { tools: result.tools ?? [], resources: result.resources ?? [], prompts: result.prompts ?? [] }, capabilityCount: { tools: result.tools?.length ?? 0, resources: result.resources?.length ?? 0, prompts: result.prompts?.length ?? 0 } }),
      grants: changed ? state.grants.map((grant) => grant.serverId === id && !grant.revokedAt ? { ...grant, revokedAt: new Date().toISOString() } : grant) : state.grants,
    };
  }),
  addGrant: (grant) => set((state) => {
    const server = state.mcpServers.find((item) => item.id === grant.serverId);
    return { grants: [...state.grants, { ...grant, capabilityFingerprint: grant.capabilityFingerprint ?? server?.capabilityFingerprint, id: crypto.randomUUID(), createdAt: new Date().toISOString() }] };
  }),
  revokeGrant: (id) => set((state) => ({ grants: state.grants.map((grant) => grant.id === id ? { ...grant, revokedAt: new Date().toISOString() } : grant) })),
  consumeGrant: (id) => set((state) => ({ grants: state.grants.map((grant) => grant.id !== id || grant.usesRemaining === undefined ? grant : grant.usesRemaining <= 1 ? { ...grant, usesRemaining: 0, revokedAt: new Date().toISOString() } : { ...grant, usesRemaining: grant.usesRemaining - 1 }) })),
  addDiagnostic: (diagnostic) => set((state) => ({ diagnostics: [...state.diagnostics.slice(-199), { ...diagnostic, id: crypto.randomUUID(), createdAt: new Date().toISOString() }] })),
  clearDiagnostics: (source) => set((state) => ({ diagnostics: source ? state.diagnostics.filter((item) => item.source !== source) : [] })),
  setProjectPolicy: (projectId, update) => set((state) => ({ policies: { ...state.policies, [projectId]: { ...(state.policies[projectId] ?? DEFAULT_POLICY), ...update } } })),
  setFeatureFlag: (flag, enabled) => set((state) => ({ featureFlags: { ...state.featureFlags, [flag]: enabled } })),
  setChatMcpEnabled: (chatId, serverId, enabled) => set((state) => {
    const disabled = state.chatDisabledMcpServerIds[chatId] ?? [];
    const explicitlyEnabled = state.chatEnabledMcpServerIds[chatId] ?? [];
    const next = enabled ? disabled.filter((id) => id !== serverId) : [...new Set([...disabled, serverId])];
    const nextEnabled = enabled ? [...new Set([...explicitlyEnabled, serverId])] : explicitlyEnabled.filter((id) => id !== serverId);
    return {
      chatDisabledMcpServerIds: { ...state.chatDisabledMcpServerIds, [chatId]: next },
      chatEnabledMcpServerIds: { ...state.chatEnabledMcpServerIds, [chatId]: nextEnabled },
    };
  }),
}), {
  name: "veyra.extensions.v1",
  version: 2,
  /** Drops the retired skill fields; `skills-store.ts` owns migrated skills. */
  migrate: (persisted) => {
    const state = persisted && typeof persisted === "object" ? persisted as Record<string, unknown> : {};
    // Park skills before this key is rewritten, so a later-created skills store
    // can still find and convert them.
    stashLegacySkills(state);
    return {
      featureFlags: { mcp: true, stdio: true, streamableHttp: true, ...(state.featureFlags as Record<string, boolean> | undefined) },
      mcpServers: Array.isArray(state.mcpServers) ? state.mcpServers : [],
      grants: Array.isArray(state.grants) ? state.grants : [],
      diagnostics: Array.isArray(state.diagnostics) ? state.diagnostics : [],
      policies: state.policies && typeof state.policies === "object" ? state.policies : {},
      chatDisabledMcpServerIds: state.chatDisabledMcpServerIds && typeof state.chatDisabledMcpServerIds === "object" ? state.chatDisabledMcpServerIds : {},
      chatEnabledMcpServerIds: state.chatEnabledMcpServerIds && typeof state.chatEnabledMcpServerIds === "object" ? state.chatEnabledMcpServerIds : {},
    } as Partial<ExtensionsStore>;
  },
}));
