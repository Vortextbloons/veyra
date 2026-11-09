// ── Project types for Veyra ─────────────────────────────────────────────────
// A Project is a persistent local container that scopes chats, tools,
// and settings around a goal or workstream.

export type ProjectKind =
  | "app"
  | "class"
  | "client"
  | "codebase"
  | "creative"
  | "research"
  | "general";

export type ProjectStatus = "active" | "paused" | "archived";

/**
 * `none` for an ordinary project whose details live in SQLite. `locked` for a
 * project that owns an encrypted vault: its name, instructions, settings, and
 * conversations only exist inside the vault and are only readable after an
 * unlock in this process.
 */
export type ProjectLockState = "none" | "locked";

export interface ProjectSettings {
  projectSystemVersion?: number;
  resources?: { path: string; directory: boolean }[];
  webSearchEnabled?: boolean;
  webSearchMode?: "auto" | "always" | "off";
  webSearchFetchEnabled?: boolean | null;
  webSearchFetchCount?: number | null;
  webSearchPerPageTimeoutSecs?: number | null;
  webSearchFetchMaxCharsPerSource?: number | null;
  webSearchContextTokenLimit?: number | null;
  enabledTools?: {
    webSearch: boolean;
  };
  modelId?: string;
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  agentProjectPath?: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  kind: ProjectKind;
  status: ProjectStatus;
  color: string;
  icon: string;
  systemPrompt: string;
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  /**
   * A locked project's row is an opaque index entry. `name` is empty and
   * `settings` is empty until the project is unlocked, and the UI must render a
   * placeholder rather than inventing content.
   */
  lockState?: ProjectLockState;
}

/** Input to create a new project. */
export interface CreateProjectInput {
  id: string;
  name: string;
  description?: string;
  kind?: ProjectKind;
  status?: ProjectStatus;
  color?: string;
  icon?: string;
  systemPrompt?: string;
  settings?: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

/** Input to update an existing project. All fields except id are optional. */
export interface UpdateProjectInput {
  id: string;
  name?: string;
  description?: string;
  kind?: ProjectKind;
  status?: ProjectStatus;
  color?: string;
  icon?: string;
  systemPrompt?: string;
  settings?: ProjectSettings;
  updatedAt: string;
  lastOpenedAt?: string;
}

// ── UI helpers ──────────────────────────────────────────────────────────────

export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  app: "App",
  class: "Class",
  client: "Client",
  codebase: "Codebase",
  creative: "Creative",
  research: "Research",
  general: "General",
};

export const PROJECT_COLORS = [
  "indigo",
  "violet",
  "blue",
  "cyan",
  "teal",
  "emerald",
  "amber",
  "orange",
  "rose",
  "pink",
  "slate",
] as const;
