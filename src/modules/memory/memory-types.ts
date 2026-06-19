// Memory type system for Veyra.
// See foldered_memory_file_graph_spec.md for the full design.
// This module is a leaf: it imports nothing from this repo and is imported by the
// memory store, the storage layer, the orchestrator, and the UI.

export type MemoryScope = "global" | "project" | "conversation" | "session";

export type MemoryStatus =
  | "active"
  | "needs_review"
  | "approved"
  | "rejected"
  | "archived";

export type MemoryMode =
  | "off"
  | "manual_only"
  | "safe_auto_save"
  | "review_all"
  | "aggressive_project_memory";

export type MemoryPriority = "permanent" | "high" | "medium" | "low" | "ephemeral";

export interface MemoryFolder {
  id: string;
  name: string;
  parentId?: string;
  projectId?: string;
  type: "manual" | "project" | "system" | "smart";
  description?: string;
  summary?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryFile {
  id: string;
  folderId: string;
  projectId?: string;
  title: string;
  slug: string;
  summary: string;
  purpose: string;
  keyPoints: string[];
  status: "active" | "draft" | "needs_review" | "archived";
  tags: string[];
  importance: 1 | 2 | 3 | 4 | 5;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  chunkCount: number;
}

export interface MemoryNode {
  id: string;
  folderId: string;
  fileId?: string;
  projectId?: string;
  conversationId?: string;
  title: string;
  content: string;
  summary: string;
  type:
    | "preference"
    | "project"
    | "project_fact"
    | "decision"
    | "instruction"
    | "summary"
    | "task"
    | "idea"
    | "file_reference"
    | "temporary_context";
  scope: MemoryScope;
  tags: string[];
  importance: 1 | 2 | 3 | 4 | 5;
  confidence: number;
  priority: MemoryPriority;
  expiresAt?: string;
  sourceMessageIds: string[];
  extractionBatchId?: string;
  duplicateOf?: string;
  contradictionOf?: string;
  origin:
    | "explicit_user_save"
    | "auto_extracted"
    | "manual_user_edit"
    | "imported"
    | "profile_setup";
  status: MemoryStatus;
  isPinned: boolean;
  userEditable: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  useCount: number;
}

export interface MemoryPack {
  content: string;
  sourceNodeIds: string[];
  sourceFileIds: string[];
  sourceFolderIds: string[];
  tokenCount: number;
  budgetUsed: number;
  reasons: Record<string, string>;
}

/** Per-turn outcome when the user had Memory enabled (for UI + debugging). */
export type MemoryRetrievalStatus = "disabled" | "skipped" | "empty" | "used";

export interface MemoryRetrievalInfo {
  status: MemoryRetrievalStatus;
  detail: string;
  pack?: MemoryPack;
}

/** Optional filter for list_memory_nodes / listMemoryNodes */
export interface MemoryNodeFilter {
  status?: MemoryStatus[];
  scope?: MemoryScope[];
  type?: MemoryNode["type"][];
  folderId?: string;
  fileId?: string;
  projectId?: string;
  isPinned?: boolean;
  origin?: MemoryNode["origin"][];
  /** Free-text query (used by search_memory) */
  query?: string;
  limit?: number;
}

/** Payload to create a new memory node */
export interface CreateMemoryNode {
  folderId: string;
  fileId?: string;
  projectId?: string;
  conversationId?: string;
  title: string;
  content: string;
  summary: string;
  type: MemoryNode["type"];
  scope: MemoryScope;
  tags: string[];
  importance: 1 | 2 | 3 | 4 | 5;
  confidence: number;
  priority?: MemoryPriority;
  expiresAt?: string;
  sourceMessageIds?: string[];
  extractionBatchId?: string;
  duplicateOf?: string;
  contradictionOf?: string;
  origin: MemoryNode["origin"];
  status: MemoryStatus;
  isPinned?: boolean;
}

/** Payload to update an existing memory node. All fields optional except id. */
export interface UpdateMemoryNode {
  id: string;
  title?: string;
  content?: string;
  summary?: string;
  type?: MemoryNode["type"];
  scope?: MemoryScope;
  tags?: string[];
  importance?: 1 | 2 | 3 | 4 | 5;
  confidence?: number;
  priority?: MemoryPriority;
  expiresAt?: string;
  sourceMessageIds?: string[];
  extractionBatchId?: string;
  duplicateOf?: string;
  contradictionOf?: string;
  status?: MemoryStatus;
  isPinned?: boolean;
  folderId?: string;
  fileId?: string;
  lastUsedAt?: string;
  useCount?: number;
}

/** Search options for search_memory */
export interface MemorySearchOptions {
  limit?: number;
  projectId?: string;
}

/** Memories that must not be auto-archived or evicted by retention policy. */
export function isProtectedMemory(
  node: Pick<MemoryNode, "isPinned" | "priority" | "importance" | "origin">,
): boolean {
  return (
    node.isPinned ||
    node.priority === "permanent" ||
    node.importance >= 5 ||
    node.origin === "explicit_user_save" ||
    node.origin === "manual_user_edit" ||
    node.origin === "profile_setup"
  );
}
