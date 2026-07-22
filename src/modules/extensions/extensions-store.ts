import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CapabilityGrant, ExtensionDiagnostic, McpServerRecord, ProjectExtensionPolicy, SkillRecord } from "./extension-types";
import { draftToSkill } from "./skill-runtime";

type ExtensionsStore = {
  featureFlags: { skills: boolean; mcp: boolean; stdio: boolean; streamableHttp: boolean };
  skills: SkillRecord[];
  mcpServers: McpServerRecord[];
  grants: CapabilityGrant[];
  diagnostics: ExtensionDiagnostic[];
  policies: Record<string, ProjectExtensionPolicy>;
  activeSkillIds: Record<string, string | null>;
  activeSkillWorkflowIds: Record<string, string | undefined>;
  chatDisabledMcpServerIds: Record<string, string[]>;
  chatEnabledMcpServerIds: Record<string, string[]>;
  installSkill: (input: { name: string; description: string; source: string; provenance: "local" | "generated"; snapshotId?: string; contentHash?: string; packageManifest?: string; packageFiles?: string[] }) => Promise<SkillRecord>;
  removeSkill: (id: string) => void;
  setSkillEnabled: (id: string, enabled: boolean) => void;
  saveMcpServer: (server: McpServerRecord) => void;
  removeMcpServer: (id: string) => void;
  setMcpDiscovery: (id: string, result: { tools?: unknown[]; resources?: unknown[]; prompts?: unknown[] }) => void;
  addGrant: (grant: Omit<CapabilityGrant, "id" | "createdAt">) => void;
  revokeGrant: (id: string) => void;
  consumeGrant: (id: string) => void;
  addDiagnostic: (diagnostic: Omit<ExtensionDiagnostic, "id" | "createdAt">) => void;
  clearDiagnostics: (source?: string) => void;
  setProjectPolicy: (projectId: string, policy: Partial<ProjectExtensionPolicy>) => void;
  setActiveSkill: (scopeId: string, skillId: string | null, workflowId?: string) => void;
  setFeatureFlag: (flag: "skills" | "mcp" | "stdio" | "streamableHttp", enabled: boolean) => void;
  setChatMcpEnabled: (chatId: string, serverId: string, enabled: boolean) => void;
  resolveActiveSkill: (scopeId: string, projectId?: string) => SkillRecord | undefined;
  resolveActiveSkillSelection: (scopeId: string, projectId?: string) => { skill: SkillRecord; workflowId?: string } | undefined;
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

/** Enabled MCP servers are active in new chats unless a chat explicitly turns one off. */
export function disabledMcpServersForChat(_servers: McpServerRecord[], storedDisabledIds: string[] | undefined): string[] {
  return storedDisabledIds ?? [];
}

export function isMcpEnabledForChat(server: McpServerRecord, disabledIds: string[] | undefined, enabledIds: string[] | undefined): boolean {
  if (disabledIds?.includes(server.id)) return false;
  return server.enabled || Boolean(enabledIds?.includes(server.id));
}

export const useExtensionsStore = create<ExtensionsStore>()(persist((set, get) => ({
  featureFlags: { skills: true, mcp: true, stdio: true, streamableHttp: true },
  skills: [], mcpServers: [], grants: [], diagnostics: [], policies: {}, activeSkillIds: {}, activeSkillWorkflowIds: {}, chatDisabledMcpServerIds: {}, chatEnabledMcpServerIds: {},
  installSkill: async (draft) => {
    const skill = await draftToSkill(draft);
    if (get().skills.some((item) => item.id === skill.id)) {
      throw new Error(`A Skill with the ID ${skill.id} is already installed. Re-import it as a reviewed revision instead.`);
    }
    set((state) => ({ skills: [...state.skills, skill] }));
    return skill;
  },
  removeSkill: (id) => set((state) => ({
    skills: state.skills.filter((skill) => skill.id !== id),
    activeSkillIds: Object.fromEntries(Object.entries(state.activeSkillIds).map(([scope, active]) => [scope, active === id ? null : active])),
    activeSkillWorkflowIds: Object.fromEntries(Object.entries(state.activeSkillWorkflowIds).map(([scope, active]) => [scope, state.activeSkillIds[scope] === id ? undefined : active])),
  })),
  setSkillEnabled: (id, enabled) => set((state) => ({ skills: state.skills.map((skill) => skill.id === id ? { ...skill, enabled, health: enabled ? "ready" : "disabled", updatedAt: new Date().toISOString() } : skill) })),
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
  setActiveSkill: (scopeId, skillId, workflowId) => set((state) => ({ activeSkillIds: { ...state.activeSkillIds, [scopeId]: skillId }, activeSkillWorkflowIds: { ...state.activeSkillWorkflowIds, [scopeId]: skillId ? workflowId : undefined } })),
  setFeatureFlag: (flag, enabled) => set((state) => ({ featureFlags: { ...state.featureFlags, [flag]: enabled } })),
  setChatMcpEnabled: (chatId, serverId, enabled) => set((state) => {
    const disabled = disabledMcpServersForChat(state.mcpServers, state.chatDisabledMcpServerIds[chatId]);
    const explicitlyEnabled = state.chatEnabledMcpServerIds[chatId] ?? [];
    const next = enabled ? disabled.filter((id) => id !== serverId) : [...new Set([...disabled, serverId])];
    const nextEnabled = enabled ? [...new Set([...explicitlyEnabled, serverId])] : explicitlyEnabled.filter((id) => id !== serverId);
    return {
      chatDisabledMcpServerIds: { ...state.chatDisabledMcpServerIds, [chatId]: next },
      chatEnabledMcpServerIds: { ...state.chatEnabledMcpServerIds, [chatId]: nextEnabled },
    };
  }),
  resolveActiveSkill: (scopeId, projectId) => {
    const explicitId = get().activeSkillIds[scopeId];
    const policy = projectId ? get().policies[projectId] : undefined;
    const id = explicitId === undefined ? policy?.defaultSkillId : explicitId;
    if (!get().featureFlags.skills) return undefined;
    const skill = get().skills.find((item) => item.id === id && item.enabled);
    if (!skill) return undefined;
    return explicitId !== undefined || !projectId || policy?.enabledSkillIds.includes(skill.id) ? skill : undefined;
  },
  resolveActiveSkillSelection: (scopeId, projectId) => {
    const skill = get().resolveActiveSkill(scopeId, projectId);
    if (!skill) return undefined;
    const workflowId = get().activeSkillWorkflowIds[scopeId];
    return { skill, workflowId: workflowId && skill.workflows.some((workflow) => workflow.id === workflowId) ? workflowId : undefined };
  },
}), { name: "veyra.extensions.v1" }));
