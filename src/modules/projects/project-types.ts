// ── Project types for Veyra ─────────────────────────────────────────────────
// A Project is a persistent local container that scopes chats, documents,
// memories, tools, and settings around a goal or workstream.

import type { MemoryMode } from "@/modules/memory/memory-types";

export type ProjectKind =
  | "app"
  | "class"
  | "client"
  | "codebase"
  | "creative"
  | "research"
  | "general";

export type ProjectStatus = "active" | "paused" | "archived";

export interface ProjectSettings {
  memoryEnabled?: boolean;
  memoryMode?: MemoryMode;
  webSearchEnabled?: boolean;
  webSearchMode?: "auto" | "always" | "off";
  webSearchFetchEnabled?: boolean | null;
  webSearchFetchCount?: number | null;
  webSearchPerPageTimeoutSecs?: number | null;
  webSearchFetchMaxCharsPerSource?: number | null;
  webSearchContextTokenLimit?: number | null;
  enabledTools?: {
    documents: boolean;
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
