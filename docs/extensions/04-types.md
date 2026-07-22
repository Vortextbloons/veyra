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
type SkillWorkflow = { id: string; name: string; instructions: string };

type SkillRecord = ExtensionRecord & {
  type: "skill";
  instructions: string;
  workflows: SkillWorkflow[];
  contentHash: string;
  snapshotId?: string;
  requestedCapabilities: string[];
};

type SkillDraft = {
  name: string;
  description: string;
  source: string;
  provenance: "local" | "generated";
  packageManifest?: string;
  packageFiles?: string[];
};

type SkillValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  name?: string;
  description?: string;
  version?: string;
  instructions?: string;
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

```typescript
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
};
```

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
