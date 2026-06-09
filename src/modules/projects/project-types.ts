// ── Project types for Veyra ─────────────────────────────────────────────────
// A Project is a persistent local container that scopes chats, documents,
// memories, tools, and settings around a goal or workstream.

import type { MemoryMode } from "@/lib/memory-types";

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

// ── Project file references (Phase 5+) ──────────────────────────────────────

export interface ProjectFileRecord {
  id: string;
  projectId: string;
  name: string;
  path?: string;
  mimeType?: string;
  sizeBytes?: number;
  contentHash?: string;
  createdAt: string;
  updatedAt: string;
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

export const PROJECT_KIND_ICONS: Record<ProjectKind, string> = {
  app: "layout-grid",
  class: "graduation-cap",
  client: "briefcase",
  codebase: "code-2",
  creative: "palette",
  research: "flask-conical",
  general: "folder",
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

export type ProjectColor = (typeof PROJECT_COLORS)[number];
