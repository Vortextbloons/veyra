import type { PermissionMode } from "@/stores/slices/permissions-slice";
import type {
  PermissionBridge,
  PermissionInvocation,
  PendingPermissionRequest,
} from "./permission-types";

/** One tool the user may place behind the permission gate. */
export type PermissionToolDefinition = {
  id: string;
  label: string;
  description: string;
  /** Where the call is intercepted. */
  bridge: PermissionBridge;
  /** Native tools only exist while a project is attached. */
  native: boolean;
};

/** Protects every MCP-backed tool without listing each one. */
export const MCP_PROTECTED_CAPABILITY_ID = "mcp";

/**
 * Tools the settings UI can protect.
 *
 * Bash leads the list because it is the only built-in capability that can run
 * arbitrary code with the app's own operating-system permissions. The rest are
 * here so the policy is usable beyond Bash without inventing per-tool switches.
 */
export const PERMISSION_TOOL_CATALOGUE: PermissionToolDefinition[] = [
  {
    id: "bash",
    label: "Bash commands",
    description: "Run shell commands through Pi's bundled Bash tool. Available only when a project folder is attached.",
    bridge: "native",
    native: true,
  },
  {
    id: "write",
    label: "Write files",
    description: "Create or overwrite a file inside the workspace.",
    bridge: "native",
    native: true,
  },
  {
    id: "edit",
    label: "Edit files",
    description: "Apply a targeted edit to an existing file inside the workspace.",
    bridge: "native",
    native: true,
  },
  {
    id: "read",
    label: "Read files",
    description: "Open a file inside the workspace.",
    bridge: "native",
    native: true,
  },
  {
    id: "grep",
    label: "Grep",
    description: "Search file contents inside the workspace.",
    bridge: "native",
    native: true,
  },
  {
    id: "find",
    label: "Find files",
    description: "List workspace paths matching a pattern.",
    bridge: "native",
    native: true,
  },
  {
    id: "ls",
    label: "List directories",
    description: "List a workspace directory.",
    bridge: "native",
    native: true,
  },
  {
    id: "web_search",
    label: "Web search",
    description: "Search the web through Veyra's own search pipeline.",
    bridge: "host",
    native: false,
  },
  {
    id: "code_execution",
    label: "Code execution",
    description: "Run a local Python snippet through Veyra's sandboxed runner.",
    bridge: "host",
    native: false,
  },
  {
    id: "create_artifact",
    label: "Artifacts",
    description: "Attach a generated document, page, or code file to the reply.",
    bridge: "host",
    native: false,
  },
  {
    id: MCP_PROTECTED_CAPABILITY_ID,
    label: "MCP tools",
    description: "Any tool exposed by an MCP server. Server approvals still apply on top of this.",
    bridge: "host",
    native: false,
  },
];

export function findPermissionTool(id: string): PermissionToolDefinition | undefined {
  return PERMISSION_TOOL_CATALOGUE.find((tool) => tool.id === id);
}

/** Native tool names Pi exposes only when a project folder is attached. */
export const NATIVE_PROJECT_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"] as const;

/**
 * Native tools this app exposes to Pi.
 *
 * This is the single source of truth for enablement AND for what Pi is told it
 * may use. `bash` is listed because Pi has a real Bash tool; whether it is
 * actually offered depends on the user's switches.
 */
export const NATIVE_TOOLS = [...NATIVE_PROJECT_TOOLS] as const;

export type NativeToolName = (typeof NATIVE_TOOLS)[number];

/** Native tools without a per-chat switch; they follow project attachment. */
export const ALWAYS_ON_NATIVE_TOOLS: readonly NativeToolName[] = ["read", "edit", "write", "grep", "find", "ls"];

/** Native tools a chat can turn on and off by itself. */
export const TOGGLEABLE_NATIVE_TOOLS: readonly NativeToolName[] = ["bash"];

export const DEFAULT_DISABLED_NATIVE_TOOL_IDS: string[] = [];

/**
 * Whether one built-in tool may run for this chat.
 *
 * The global switch and the per-chat switch are both authoritative, so they
 * take precedence over every permission mode: Full access never turns a
 * disabled capability back on.
 */
export function isNativeToolEnabled(
  toolName: string,
  options: { disabled: readonly string[]; chatDisabled: readonly string[] },
): boolean {
  if (!(NATIVE_TOOLS as readonly string[]).includes(toolName)) return true;
  if (!TOGGLEABLE_NATIVE_TOOLS.includes(toolName as NativeToolName)) return true;
  return !options.disabled.includes(toolName) && !options.chatDisabled.includes(toolName);
}

/** The native tool names Pi should be allowed to use for this chat. */
export function enabledNativeTools(options: {
  disabled: readonly string[];
  chatDisabled: readonly string[];
}): string[] {
  return NATIVE_TOOLS.filter((tool) => isNativeToolEnabled(tool, options));
}

/** Tools whose per-chat toggle the composer and Chat settings show. */
export function toggleableNativeToolLabel(toolName: string): string {
  return toolName === "bash" ? "Bash commands" : toolName;
}

function isMcpToolName(toolName: string): boolean {
  return toolName.startsWith("mcp__");
}

/**
 * Whether one call must pass the gate.
 *
 * MCP capability ids use the `mcp__<server>__<tool>` form, so the single
 * "MCP tools" entry covers all of them.
 */
export function isToolProtected(toolName: string, protectedToolIds: readonly string[]): boolean {
  if (!toolName) return false;
  if (protectedToolIds.includes(toolName)) return true;
  return isMcpToolName(toolName) && protectedToolIds.includes(MCP_PROTECTED_CAPABILITY_ID);
}

/** Stable JSON: object keys sorted, arrays kept in order. */
export function canonicalArgs(value: unknown): string {
  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === "object") {
      const record = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) {
        const next = record[key];
        if (next !== undefined) out[key] = walk(next);
      }
      return out;
    }
    return input;
  };
  return JSON.stringify(walk(value ?? {}));
}

/**
 * The immutable binding an approval is attached to.
 *
 * Session, tool, exact arguments, and working directory all participate, so an
 * approval can never be replayed for a different command, another session, or a
 * later call.
 */
export function invocationBinding(input: {
  sessionId: string;
  toolName: string;
  args: Record<string, unknown>;
  cwd: string;
  bridge: PermissionBridge;
}): string {
  return JSON.stringify([
    input.sessionId,
    input.bridge,
    input.toolName,
    canonicalArgs(input.args),
    input.cwd,
  ]);
}

/** Short, stable digest of a binding. Used to spot repeats, never as a secret. */
export function fingerprintBinding(binding: string): string {
  // FNV-1a over UTF-16 code units. Collisions only merge identical-looking
  // records; every authorization check compares the full binding instead.
  let hash = 0xcbf29ce4n;
  for (let index = 0; index < binding.length; index += 1) {
    hash ^= BigInt(binding.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Builds the queued request for one invocation. */
export function buildPermissionRequest(input: {
  invocation: PermissionInvocation;
  now?: number;
}): PendingPermissionRequest & { binding: string } {
  const { invocation } = input;
  const binding = invocationBinding(invocation);
  return {
    ...invocation,
    // Session plus Pi's own tool-call id identifies one invocation, and Pi
    // always assigns a fresh id to a retried call.
    id: `${invocation.sessionId}:${invocation.toolCallId}`,
    fingerprint: fingerprintBinding(binding),
    binding,
    requestedAt: input.now ?? Date.now(),
    state: "awaiting-user",
    needsManualReview: false,
  };
}

/** One-line description of what will actually run, for the approval card. */
export function describeInvocation(invocation: PermissionInvocation): string {
  if (invocation.toolName === "bash" && typeof invocation.args.command === "string") {
    return invocation.args.command;
  }
  return canonicalArgs(invocation.args);
}

export function permissionModeLabel(mode: PermissionMode): string {
  switch (mode) {
    case "full":
      return "Full access";
    case "auto":
      return "Auto";
    default:
      return "Ask";
  }
}

export function permissionModeDescription(mode: PermissionMode): string {
  switch (mode) {
    case "full":
      return "Protected tools run immediately. Disabled tools and MCP approvals still apply.";
    case "auto":
      return "A separate reviewer model allows or denies each call. Any doubt blocks it.";
    default:
      return "Every protected call waits for you to accept once or deny it.";
  }
}
