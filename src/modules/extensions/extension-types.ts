export type ExtensionType = "skill" | "mcp_server";
export type ExtensionHealth = "ready" | "disabled" | "degraded" | "failed";

export type ExtensionRecord = {
  id: string;
  type: ExtensionType;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  provenance: "local" | "generated" | "manual";
  installedAt: string;
  updatedAt: string;
  health: ExtensionHealth;
};

export type SkillWorkflow = { id: string; name: string; instructions: string };

export type SkillRecord = ExtensionRecord & {
  type: "skill";
  instructions: string;
  workflows: SkillWorkflow[];
  contentHash: string;
  snapshotId?: string;
  requestedCapabilities: string[];
};

export type McpTransport = "stdio" | "streamable_http";
export type McpServerRecord = ExtensionRecord & {
  type: "mcp_server";
  transport: McpTransport;
  endpoint?: string;
  executable?: string;
  arguments?: string[];
  workingDirectory?: string;
  timeoutMs: number;
  projectIds: string[];
  capabilityCount: { tools: number; resources: number; prompts: number };
  /** Snapshot of discovered capabilities. Changing it invalidates prior grants. */
  capabilityFingerprint?: string;
  lastError?: string;
  lastConnectedAt?: string;
  capabilities?: { tools: unknown[]; resources: unknown[]; prompts: unknown[] };
};

export type PermissionCategory = "read_local_files" | "write_local_files" | "execute_external_processes" | "access_internet" | "read_documents" | "modify_documents" | "read_memory" | "modify_memory" | "access_credentials" | "external_mutation" | "destructive";
export type CapabilityGrant = { id: string; serverId: string; capabilityId: string; projectId?: string; chatId?: string; category: PermissionCategory; decision: "allow" | "deny"; expiresAt?: string; usesRemaining?: number; createdAt: string; revokedAt?: string; capabilityFingerprint?: string };
export type ExtensionDiagnostic = { id: string; source: string; severity: "info" | "warning" | "error"; code: string; message: string; remediation?: string; createdAt: string };

export type SkillDraft = {
  name: string;
  description: string;
  source: string;
  provenance: "local" | "generated";
  packageManifest?: string;
  packageFiles?: string[];
};

export type SkillValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  name?: string;
  description?: string;
  version?: string;
  instructions?: string;
};

export type ProjectExtensionPolicy = {
  enabledSkillIds: string[];
  defaultSkillId?: string;
  enabledMcpServerIds: string[];
  disabledCapabilityIds: string[];
};
