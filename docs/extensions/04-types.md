# Extension Key Types

Accurate as of the current source code (`src/modules/extensions/extension-types.ts`).

## Core Types

```typescript
type ExtensionType = "skill" | "mcp_server";
type ExtensionHealth = "ready" | "disabled" | "degraded" | "failed";

type ExtensionRecord = {
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
```

## Skill Types

```typescript
/** A legacy manifest workflow. Kept only so it can be converted. */
type SkillWorkflow = { id: string; name: string; instructions: string };

type SkillRecord = ExtensionRecord & {
  type: "skill";
  /** Instruction body only; frontmatter is generated from name/description. */
  instructions: string;
  contentHash: string;
  /** Spec-compliant folder name used when the Skill is written as SKILL.md. */
  slug: string;
  metadata?: Record<string, string>;
  files?: string[];
  snapshotId?: string;
  legacyWorkflows?: SkillWorkflow[];
  legacyCapabilities?: string[];
};

/** The immutable record of a Skill applied to one request. */
type SkillInvocation = {
  id: string;
  name: string;
  slug: string;
  contentHash: string;
  instructions: string;
  scope: "turn" | "chat";
  location?: string;
};

type SkillDraft = {
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

type SkillValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  name?: string;
  description?: string;
  instructions?: string;
  metadata?: Record<string, string>;
};
```

## MCP Server Types

```typescript
type McpTransport = "stdio" | "streamable_http";

type McpServerRecord = ExtensionRecord & {
  type: "mcp_server";
  transport: McpTransport;
  endpoint?: string;
  executable?: string;
  arguments?: string[];
  workingDirectory?: string;
  timeoutMs: number;
  projectIds: string[];
  capabilityCount: { tools: number; resources: number; prompts: number };
  capabilityFingerprint?: string;
  lastError?: string;
  lastConnectedAt?: string;
  capabilities?: { tools: unknown[]; resources: unknown[]; prompts: unknown[] };
};
```

## Permission Types

```typescript
type PermissionCategory =
  | "read_local_files" | "write_local_files"
  | "execute_external_processes" | "access_internet"
  | "read_documents" | "modify_documents"
  | "read_memory" | "modify_memory"
  | "access_credentials" | "external_mutation"
  | "destructive";

type CapabilityGrant = {
  id: string;
  serverId: string;
  capabilityId: string;
  projectId?: string;
  chatId?: string;
  category: PermissionCategory;
  decision: "allow" | "deny";
  expiresAt?: string;
  usesRemaining?: number;
  createdAt: string;
  revokedAt?: string;
  capabilityFingerprint?: string;
};
```

## Capability Catalog

```typescript
type SideEffectLevel = "read" | "local_write" | "external_write" | "destructive";

type ToolCapability = {
  kind: "tool";
  id: string;
  serverId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  sideEffect: SideEffectLevel;
};
```

## Store State

Skills live in their own store because they are edited as documents and selected
per request, which is a different lifecycle from a long-lived server process.

```typescript
type SkillsStore = {
  skills: SkillRecord[];
  /** Persistent for the chat, shown as removable chips. */
  chatSkillIds: Record<string, string[]>;
  /** Applies to the next request only; cleared when it is sent. */
  pendingTurnSkillIds: Record<string, string[]>;
  skillsEnabled: boolean;
};

type ExtensionsStore = {
  featureFlags: { mcp: boolean; stdio: boolean; streamableHttp: boolean };
  mcpServers: McpServerRecord[];
  grants: CapabilityGrant[];
  diagnostics: ExtensionDiagnostic[];
  policies: Record<string, ProjectExtensionPolicy>;
  chatDisabledMcpServerIds: Record<string, string[]>;
  chatEnabledMcpServerIds: Record<string, string[]>;
};
```

## Request Records

`SkillInvocation` is stored on the user event (`AgentEvent.skillInvocations`) and
on the saved `ChatMessage`. It holds the ID, content hash, and instruction
snapshot, so editing or deleting a Skill cannot change what a past request ran and
Retry can repeat the original instructions. `ChatMessage.skillSnapshot` is gone;
it recorded only an ID and version, which no longer identifies the content.

## ToolCallState Extension

In `src/modules/chat/chat-types.ts`, the `ToolCallState` type includes an optional MCP approval field:

```typescript
mcpApproval?: {
  serverId: string;
  toolName: string;
  projectId?: string;
  chatId?: string;
  capabilityFingerprint?: string;
};
```
