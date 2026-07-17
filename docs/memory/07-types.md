# Memory Key Types

Accurate as of the current source code (`src/modules/memory/memory-types.ts`).

## Core Types

```typescript
type MemoryMode =
  | "off" | "manual_only" | "safe_auto_save"
  | "review_all" | "aggressive_project_memory";

type MemoryScope = "global" | "project" | "conversation" | "session";

type MemoryPriority = "permanent" | "high" | "medium" | "low" | "ephemeral";

type MemoryStatus =
  | "active" | "needs_review" | "approved" | "rejected" | "archived";

type MemoryRetrievalStatus = "disabled" | "skipped" | "empty" | "used";
```

## MemoryNode

```typescript
interface MemoryNode {
  id: string;
  folderId: string;
  fileId?: string;
  projectId?: string;
  conversationId?: string;
  title: string;
  content: string;
  summary: string;
  type:
    | "preference" | "project" | "project_fact" | "decision"
    | "instruction" | "summary" | "task" | "idea"
    | "file_reference" | "temporary_context";
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
    | "explicit_user_save" | "auto_extracted"
    | "manual_user_edit" | "imported" | "profile_setup";
  status: MemoryStatus;
  isPinned: boolean;
  userEditable: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  useCount: number;
  relevanceScore?: number;
  vectorScore?: number;
  bm25Score?: number;
  embeddingDim?: number;
}
```

## MemoryFolder / MemoryFile

```typescript
interface MemoryFolder {
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

interface MemoryFile {
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
```

## Retrieval & CRUD

```typescript
interface MemoryPack {
  content: string;
  sourceNodeIds: string[];
  sourceFileIds: string[];
  sourceFolderIds: string[];
  tokenCount: number;
  budgetUsed: number;
  reasons: Record<string, string>;
}

interface MemoryRetrievalInfo {
  status: MemoryRetrievalStatus;
  detail: string;
  pack?: MemoryPack;
}

interface MemoryNodeFilter {
  status?: MemoryStatus[];
  scope?: MemoryScope[];
  type?: MemoryNode["type"][];
  folderId?: string;
  fileId?: string;
  projectId?: string;
  isPinned?: boolean;
  origin?: MemoryNode["origin"][];
  query?: string;
  limit?: number;
}

interface CreateMemoryNode { /* mirrors MemoryNode omitting id */ }

interface UpdateMemoryNode {
  id: string;
  /* all MemoryNode fields optional except id */
}

interface MemorySearchOptions {
  limit?: number;
  projectId?: string;
}
```

## Protected Memory

```typescript
function isProtectedMemory(node: {
  isPinned: boolean;
  priority: MemoryPriority;
  importance: number;
  origin: MemoryNode["origin"];
}): boolean
```

Returns `true` for pinned, permanent, importance >= 5, explicit user saves, manual edits, or profile setup nodes.
