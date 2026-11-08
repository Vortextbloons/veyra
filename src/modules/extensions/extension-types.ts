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

/** A workflow bundled by an older Veyra manifest. Readable so it can be converted. */
export type SkillWorkflow = { id: string; name: string; instructions: string };

/**
 * A Skill is a reusable Markdown instruction set. `name`, `description`, and
 * `instructions` are the whole model; `id` and `contentHash` stay internal so
 * the library can address and version a skill without exposing storage details
 * in the editor.
 */
export type SkillRecord = ExtensionRecord & {
  type: "skill";
  /** Instruction body only. Frontmatter is generated from `name`/`description`. */
  instructions: string;
  contentHash: string;
  /** Spec-compliant folder name used when the skill is materialized as SKILL.md. */
  slug: string;
  /** Extra frontmatter fields Veyra does not interpret, preserved on export. */
  metadata?: Record<string, string>;
  /** Supporting files carried by an imported package. Instruction-only skills omit this. */
  files?: string[];
  snapshotId?: string;
  /** Legacy manifest workflows, kept until the user converts or discards them. */
  legacyWorkflows?: SkillWorkflow[];
  /** Legacy manifest capability declarations, kept for reference only. */
  legacyCapabilities?: string[];
};

/** The immutable record of a Skill applied to one request. */
export type SkillInvocation = {
  id: string;
  name: string;
  slug: string;
  contentHash: string;
  instructions: string;
  /** `turn` applies to one request; `chat` stays applied until removed. */
  scope: "turn" | "chat";
  /** Directory Pi loaded the skill from, when one was materialized. */
  location?: string;
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

export type PermissionCategory = "read_local_files" | "write_local_files" | "execute_external_processes" | "access_internet" | "access_credentials" | "external_mutation" | "destructive";
export type CapabilityGrant = { id: string; serverId: string; capabilityId: string; projectId?: string; chatId?: string; category: PermissionCategory; decision: "allow" | "deny"; expiresAt?: string; usesRemaining?: number; createdAt: string; revokedAt?: string; capabilityFingerprint?: string };
export type ExtensionDiagnostic = { id: string; source: string; severity: "info" | "warning" | "error"; code: string; message: string; remediation?: string; createdAt: string };

/** Fields a user edits directly in the Skill library. */
export type SkillDraft = {
  name: string;
  description: string;
  instructions: string;
  provenance?: "local" | "generated";
  files?: string[];
  snapshotId?: string;
  metadata?: Record<string, string>;
  legacyWorkflows?: SkillWorkflow[];
  legacyCapabilities?: string[];
};

export type SkillValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  name?: string;
  description?: string;
  instructions?: string;
  metadata?: Record<string, string>;
};

export type ProjectExtensionPolicy = {
  enabledSkillIds: string[];
  enabledMcpServerIds: string[];
  disabledCapabilityIds: string[];
};
