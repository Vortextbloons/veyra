// Memory storage layer — the only place in the frontend that talks to the
// Rust memory commands. Stores and components import from here.
//
// All Tauri command arguments are passed as snake_case-named parameters at
// the IPC boundary; the Rust side uses camelCase serde, but the IPC layer
// itself uses the Rust parameter names. We send JSON-serialized strings
// for the structured payloads (filter / create / update) per the
// implementation in src-tauri/src/memory_db.rs.

import { invoke } from "@tauri-apps/api/core";
import { newId, nowIso } from "@/lib/id";
import { useSettingsStore } from "@/stores/settings-store";
import type {
  CreateMemoryNode,
  MemoryFile,
  MemoryFolder,
  MemoryNode,
  MemoryNodeFilter,
  MemorySearchOptions,
  UpdateMemoryNode,
} from "@/modules/memory/memory-types";

export type EmbeddingStatus = {
  totalNodes: number;
  embeddedCount: number;
  missingIds: string[];
};

export type DuplicatePair = {
  nodeAId: string;
  nodeBId: string;
  similarity: number;
};

export type VectorSearchResult = {
  nodes: MemoryNode[];
  queryVectorAvailable: boolean;
};

export async function listMemoryFolders(): Promise<MemoryFolder[]> {
  return invoke<MemoryFolder[]>("list_memory_folders");
}

export async function listMemoryFiles(
  folderId?: string,
): Promise<MemoryFile[]> {
  return invoke<MemoryFile[]>("list_memory_files", { folderId: folderId ?? null });
}

export async function listMemoryNodes(
  filter: MemoryNodeFilter = {},
): Promise<MemoryNode[]> {
  return invoke<MemoryNode[]>("list_memory_nodes", {
    filter: JSON.stringify(filter),
  });
}

export async function createMemoryNode(
  input: Omit<CreateMemoryNode, "id"> & { id?: string },
): Promise<MemoryNode> {
  const now = nowIso();
  const id = input.id ?? newId("mem");
  const { vectorSearchEnabled, vectorSearchEndpointUrl, vectorSearchModel } = useSettingsStore.getState();
  const payload = {
    id,
    folderId: input.folderId,
    fileId: input.fileId ?? null,
    projectId: input.projectId ?? null,
    conversationId: input.conversationId ?? null,
    title: input.title,
    content: input.content,
    summary: input.summary,
    type: input.type,
    scope: input.scope,
    tags: input.tags,
    importance: input.importance,
    confidence: input.confidence,
    priority: input.priority ?? (input.isPinned ? "permanent" : "medium"),
    expiresAt: input.expiresAt ?? null,
    sourceMessageIds: input.sourceMessageIds ?? [],
    extractionBatchId: input.extractionBatchId ?? null,
    duplicateOf: input.duplicateOf ?? null,
    contradictionOf: input.contradictionOf ?? null,
    origin: input.origin,
    status: input.status,
    isPinned: input.isPinned ?? false,
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  };
  return invoke<MemoryNode>("create_memory_node", {
    input: JSON.stringify(payload),
    vectorSearchEnabled,
    endpointUrl: vectorSearchEndpointUrl || null,
    model: vectorSearchModel || null,
  });
}

export async function updateMemoryNode(
  input: UpdateMemoryNode,
): Promise<MemoryNode> {
  const payload = { ...input, updatedAt: nowIso() };
  const { vectorSearchEnabled, vectorSearchEndpointUrl, vectorSearchModel } = useSettingsStore.getState();
  return invoke<MemoryNode>("update_memory_node", {
    input: JSON.stringify(payload),
    vectorSearchEnabled,
    endpointUrl: vectorSearchEndpointUrl || null,
    model: vectorSearchModel || null,
  });
}

export async function archiveMemoryNode(id: string): Promise<void> {
  await invoke<void>("archive_memory_node", { id });
}

export async function deleteMemoryNode(id: string): Promise<void> {
  await invoke<void>("delete_memory_node", { id });
}

export async function pinMemoryNode(id: string, pinned: boolean): Promise<void> {
  await invoke<void>("pin_memory_node", { id, pinned });
}

export async function searchMemory(
  query: string,
  options: MemorySearchOptions = {},
): Promise<MemoryNode[]> {
  const limit = options.limit ?? 20;
  return invoke<MemoryNode[]>("search_memory", {
    query,
    limit,
    projectId: options.projectId ?? null,
  });
}

// ---------------------------------------------------------------------------
// Vector search & embedding IPC
// ---------------------------------------------------------------------------

export async function vectorSearchMemory(
  query: string,
  options: {
    limit?: number;
    projectId?: string;
    endpointUrl?: string;
    model?: string;
    vectorWeight?: number;
    bm25Weight?: number;
  } = {},
): Promise<VectorSearchResult> {
  return invoke<VectorSearchResult>("vector_search_memory", {
    query,
    limit: options.limit ?? 20,
    projectId: options.projectId ?? null,
    endpointUrl: options.endpointUrl ?? null,
    model: options.model ?? null,
    vectorWeight: options.vectorWeight ?? 0.5,
    bm25Weight: options.bm25Weight ?? 0.4,
  });
}

export async function computeAllEmbeddings(options: {
  endpointUrl?: string;
  model?: string;
  projectId?: string;
}): Promise<number> {
  return invoke<number>("compute_all_embeddings", {
    endpointUrl: options.endpointUrl ?? null,
    model: options.model ?? null,
    projectId: options.projectId ?? null,
  });
}

export async function getEmbeddingStatus(
  projectId?: string,
): Promise<EmbeddingStatus> {
  return invoke<EmbeddingStatus>("get_embedding_memory_status", {
    projectId: projectId ?? null,
  });
}

export async function findDuplicateNodes(
  threshold: number = 0.92,
): Promise<DuplicatePair[]> {
  return invoke<DuplicatePair[]>("find_duplicate_memory_nodes", {
    threshold,
  });
}
