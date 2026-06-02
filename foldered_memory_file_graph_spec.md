# Foldered Memory File Graph Specification

## 1. Overview

The memory system is a scalable, context-efficient memory architecture for a local-first AI app such as **Veyra Regenter**.

The system is designed around one core rule:

> Store broadly, organize clearly, retrieve narrowly, and inject only compressed relevant memory.

Instead of storing memory as one giant list, the app uses a layered structure:

```text
Folders → Files → Nodes / Chunks → Edges → Memory Packs
```

This lets the AI first get a broad overview, then open the right memory file, then jump deeper into exact nodes or chunks only when needed.

The system supports:

- folders for user-facing organization
- files for broad topic summaries
- nodes for individual reusable memories
- chunks for searchable text inside longer files
- edges for relationships between memories
- tags for flexible filtering
- smart folders for automatic views
- memory inbox for AI-suggested memories
- pseudo tool calls for local-model-compatible memory actions
- automatic memory extraction after each chat
- strict token budgets to prevent context overflow

---

## 2. Design Goals

### 2.1 Context Efficiency

The memory system must not dump every memory into the prompt.

It should:

- decide if memory is needed
- search only relevant scopes
- retrieve candidate memories
- rank them
- expand related memories only when helpful
- compress the result
- apply a strict token budget
- inject only the final memory pack into context

### 2.2 Local-First Storage

The memory system should work locally by default.

Recommended storage:

- SQLite for structured memory records
- local vector index for semantic search
- local file storage for attachments or exported memory files
- optional cloud sync later

### 2.3 User Control

The user must be able to:

- view memories
- edit memories
- delete memories
- pin memories
- archive memories
- move memories between folders
- approve or reject AI-suggested memories
- disable memory
- disable inferred memory
- export/import memory
- see which memories were used in a response

### 2.4 Project Awareness

Project memory should only appear when the matching project is active.

Example:

```text
Project: Veyra Regenter
Memory: Tools should be side toggles.
```

That memory should not randomly appear in unrelated chats unless the user explicitly asks for it.

### 2.5 Safe Automatic Memory

The AI can automatically extract useful memories after each chat, but it should not blindly save everything.

Auto-save is allowed for:

- explicit user instructions
- clear project decisions
- stable technical choices
- durable app goals
- high-confidence preferences

Review is required for:

- inferred preferences
- personal details
- low-confidence guesses
- possible duplicates
- conflicting memories

Never save:

- random one-time details
- full raw conversations
- sensitive information without approval
- temporary thoughts
- duplicate facts

---

## 3. Core Concepts

## 3.1 Folders

Folders are the highest-level user-facing organization layer.

They help the user browse memory like a file manager.

Example:

```text
Memory
├─ Global Memory
│  ├─ User Preferences
│  ├─ Coding Style
│  └─ Personal Instructions
│
├─ Projects
│  └─ Veyra Regenter
│     ├─ Overview
│     ├─ UI / UX
│     ├─ Memory System
│     ├─ Model Providers
│     ├─ Tools
│     └─ Agents
│
├─ Smart Folders
│  ├─ Pinned
│  ├─ Needs Review
│  ├─ Low Confidence
│  ├─ Conflicts
│  └─ Recently Used
│
└─ Archived
```

Folders should contain:

- child folders
- memory files
- folder summary
- folder description
- optional project association

Folders are not the final retrieval unit. They are the broad starting point.

---

## 3.2 Files

Files live inside folders.

A memory file is a focused memory document that gives the AI a broad overview of a topic before it jumps deeper.

Example:

```text
Projects / Veyra Regenter / Memory System
├─ memory-overview.mem
├─ foldered-memory-file-graph.mem
├─ auto-memory-after-chat.mem
├─ context-budget-rules.mem
├─ pseudo-tool-calling.mem
└─ memory-ui-design.mem
```

Each file should contain:

- title
- summary
- purpose
- key points
- linked nodes
- chunks
- last updated timestamp
- tags
- confidence
- importance

Files are useful because they let the AI retrieve in stages:

```text
Scan folders → read file summaries → open relevant files → retrieve exact nodes/chunks
```

---

## 3.3 Nodes

A memory node is one reusable piece of knowledge.

Example:

```text
Node: Memory should avoid context overflow
Type: Project Decision
Folder: Projects / Veyra Regenter / Memory System
File: context-budget-rules.mem
Content: The memory system should never inject all memories. It should retrieve, rank, compress, and apply a strict token budget.
Tags: memory, context, token-budget
Importance: 5
Confidence: 1.0
```

Nodes should usually be small and specific.

Good node:

```text
User prefers minimal UI with advanced settings hidden unless needed.
```

Bad node:

```text
Entire full conversation copied into memory.
```

---

## 3.4 Chunks

Chunks are searchable pieces of longer memory files.

Use chunks when a file has long details that should be semantically searchable.

Example:

```text
File: memory-ui-design.mem
Chunk 1: Main layout
Chunk 2: Memory cards
Chunk 3: Right detail panel
Chunk 4: Graph view
Chunk 5: Memory used dropdown
```

Chunks are lower-level than nodes.

Use nodes for important structured facts.  
Use chunks for longer text sections.

---

## 3.5 Edges

Edges connect memory nodes, files, folders, and projects.

Example:

```text
[Tools should be side toggles]
    supports → [Minimal UI preference]

[Old bottom tools idea]
    updated_by → [Tools should be side toggles]

[Memory token budget]
    belongs_to → [Veyra Regenter / Memory System]
```

Edges allow graph-based expansion.

When the AI finds one relevant memory, it can also inspect nearby linked memory if the token budget allows.

---

## 3.6 Tags

Tags are flexible labels for search and filtering.

Examples:

```text
memory
ui
tools
agents
lm-studio
provider
context-budget
project-decision
preference
auto-save
```

Tags should not replace folders.  
Folders are for structure.  
Tags are for cross-cutting labels.

---

## 3.7 Smart Folders

Smart folders are automatic filtered views.

Examples:

```text
Pinned
Needs Review
Low Confidence
Conflicts
Recently Used
Auto-Saved
Explicitly Saved
Unused for 90 Days
Archived
```

Smart folders do not physically move memories.  
They show memories based on rules.

---

## 3.8 Memory Inbox

The Memory Inbox is where uncertain AI-created memories go.

The user can:

- approve
- edit
- reject
- archive
- move to folder
- merge with existing memory

Example inbox items:

```text
Suggested: User prefers automatic memory after each chat.
Suggested: Memory files should give broad overviews.
Suggested: Folders should contain files, nodes, and linked summaries.
```

---

## 4. System Architecture

```text
User Message
    ↓
Chat Orchestrator
    ↓
Memory Router
    ↓
Folder/File Overview Search
    ↓
Node/Chunk Retrieval
    ↓
Graph Expansion
    ↓
Memory Ranker
    ↓
Memory Compressor
    ↓
Memory Pack Builder
    ↓
Prompt Builder
    ↓
AI Provider
    ↓
Assistant Response
    ↓
Post-Chat Memory Extractor
    ↓
Memory Inbox / Auto-Save
```

---

## 5. Main Components

## 5.1 Chat Orchestrator

The orchestrator controls the full request flow.

Responsibilities:

- receive user message
- identify active conversation
- identify active project
- call memory router
- call prompt builder
- call provider adapter
- save messages
- trigger memory extraction after chat

---

## 5.2 Memory Router

The memory router decides whether memory is needed.

It checks:

```text
Is the user asking about previous work?
Is the message related to a project?
Is the user asking about preferences?
Does the answer depend on prior decisions?
Is this a simple standalone question?
```

If memory is not needed, it returns:

```json
{
  "needsMemory": false
}
```

If memory is needed, it returns search plans:

```json
{
  "needsMemory": true,
  "reason": "User is referring to the current memory system design.",
  "folderHints": ["Projects/Veyra Regenter/Memory System"],
  "queries": [
    "foldered memory file graph",
    "memory folders files nodes",
    "auto memory after chat"
  ],
  "tokenBudget": 700
}
```

---

## 5.3 Folder/File Overview Search

This stage searches broad summaries first.

Search targets:

- folder summaries
- file summaries
- file key points
- tags
- project titles

This prevents the AI from searching every node immediately.

Flow:

```text
Search folder summaries
    ↓
Choose top folders
    ↓
Search file summaries inside those folders
    ↓
Choose top files
```

---

## 5.4 Node/Chunk Retrieval

After relevant files are selected, the system searches inside them.

Search methods:

- semantic similarity
- keyword match
- tag match
- project match
- recency
- importance
- pinned status
- source conversation match

---

## 5.5 Graph Expansion

After finding relevant nodes, the system may expand to linked nodes.

Expansion must be limited.

Recommended default:

```ts
const graphExpansion = {
  maxDepth: 1,
  maxExtraNodes: 5,
  minEdgeStrength: 0.65
}
```

For deep project work:

```ts
const deepGraphExpansion = {
  maxDepth: 2,
  maxExtraNodes: 12,
  minEdgeStrength: 0.55
}
```

Never allow unlimited graph traversal.

---

## 5.6 Memory Ranker

Candidate memories are scored before injection.

Recommended formula:

```ts
score =
  semanticSimilarity * 0.30 +
  keywordMatch * 0.10 +
  folderMatch * 0.10 +
  fileMatch * 0.10 +
  projectMatch * 0.15 +
  importance * 0.10 +
  confidence * 0.10 +
  recency * 0.03 +
  pinnedBoost * 0.02
```

Then filter out:

- archived memories
- rejected memories
- unrelated project memories
- duplicates
- low-confidence memories unless directly relevant
- contradicted memories that are not the latest

---

## 5.7 Memory Compressor

The compressor turns selected memory into a short memory block.

It should:

- merge duplicates
- remove filler
- prefer summaries over full content
- preserve key decisions
- include enough detail to answer well
- stay under token budget

Example output:

```text
Relevant memory:
- User is designing Veyra Regenter, a local-first AI app.
- Memory should use folders for broad organization, files for topic overviews, and nodes/chunks for deeper retrieval.
- Auto memory should run after each chat, but uncertain memories should go to an inbox.
- Memory must be compressed and token-limited before entering context.
```

---

## 5.8 Memory Pack Builder

The memory pack is the only memory content that enters the final prompt.

A memory pack contains:

```ts
type MemoryPack = {
  content: string
  sourceNodeIds: string[]
  sourceFileIds: string[]
  sourceFolderIds: string[]
  tokenCount: number
  budgetUsed: number
}
```

The app should store which memory pack was used for each response.

This powers the "Memory Used" dropdown.

---

## 5.9 Post-Chat Memory Extractor

After each chat, the app runs an extraction pass.

It extracts:

- project decisions
- user preferences
- repeated corrections
- stable technical choices
- new goals
- important open questions
- updated summaries

It should not extract:

- random temporary details
- sensitive information without permission
- full raw messages
- duplicate facts
- low-confidence assumptions

---

## 6. Data Model

## 6.1 MemoryFolder

```ts
type MemoryFolder = {
  id: string
  name: string

  parentId?: string
  projectId?: string

  type:
    | "manual"
    | "project"
    | "system"
    | "smart"

  description?: string
  summary?: string

  icon?: string
  color?: string

  sortOrder: number

  createdAt: string
  updatedAt: string
}
```

---

## 6.2 MemoryFile

```ts
type MemoryFile = {
  id: string

  folderId: string
  projectId?: string

  title: string
  slug: string

  summary: string
  purpose: string
  keyPoints: string[]

  status:
    | "active"
    | "draft"
    | "needs_review"
    | "archived"

  tags: string[]

  importance: 1 | 2 | 3 | 4 | 5
  confidence: number

  createdAt: string
  updatedAt: string
  lastOpenedAt?: string

  nodeCount: number
  chunkCount: number
}
```

---

## 6.3 MemoryNode

```ts
type MemoryNode = {
  id: string

  folderId: string
  fileId?: string
  projectId?: string
  conversationId?: string

  title: string
  content: string
  summary: string

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
    | "temporary_context"

  scope:
    | "global"
    | "project"
    | "conversation"
    | "session"

  tags: string[]

  importance: 1 | 2 | 3 | 4 | 5
  confidence: number

  origin:
    | "explicit_user_save"
    | "auto_extracted"
    | "manual_user_edit"
    | "imported"

  status:
    | "active"
    | "needs_review"
    | "approved"
    | "rejected"
    | "archived"

  isPinned: boolean
  userEditable: boolean

  createdAt: string
  updatedAt: string
  lastUsedAt?: string
  useCount: number
}
```

---

## 6.4 MemoryChunk

```ts
type MemoryChunk = {
  id: string

  fileId: string
  nodeId?: string

  content: string
  summary: string

  chunkIndex: number
  tokenCount: number

  embeddingId?: string

  createdAt: string
  updatedAt: string
}
```

---

## 6.5 MemoryEdge

```ts
type MemoryEdge = {
  id: string

  fromType: "folder" | "file" | "node" | "chunk" | "project"
  fromId: string

  toType: "folder" | "file" | "node" | "chunk" | "project"
  toId: string

  relation:
    | "belongs_to"
    | "contains"
    | "related_to"
    | "updates"
    | "updated_by"
    | "contradicts"
    | "supports"
    | "depends_on"
    | "source_of"
    | "used_by"
    | "mentions"

  strength: number

  createdAt: string
}
```

---

## 6.6 MemoryEmbedding

```ts
type MemoryEmbedding = {
  id: string

  targetType: "folder" | "file" | "node" | "chunk"
  targetId: string

  embeddingModel: string
  vector: number[] | Blob

  createdAt: string
}
```

---

## 6.7 MemoryEvent

```ts
type MemoryEvent = {
  id: string

  targetType: "folder" | "file" | "node" | "chunk"
  targetId: string

  eventType:
    | "created"
    | "updated"
    | "moved"
    | "merged"
    | "archived"
    | "deleted"
    | "used"
    | "approved"
    | "rejected"

  oldValue?: string
  newValue?: string

  source:
    | "user"
    | "assistant"
    | "auto_extractor"
    | "import"

  createdAt: string
}
```

---

## 6.8 MemoryExtractionRun

```ts
type MemoryExtractionRun = {
  id: string

  conversationId: string
  projectId?: string

  mode:
    | "manual_only"
    | "safe_auto_save"
    | "review_all"
    | "aggressive_project_memory"

  status:
    | "running"
    | "completed"
    | "failed"

  proposedCount: number
  savedCount: number
  reviewCount: number
  rejectedCount: number

  createdAt: string
}
```

---

## 7. SQLite Schema

## 7.1 memory_folders

```sql
CREATE TABLE memory_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  project_id TEXT,

  type TEXT NOT NULL,

  description TEXT,
  summary TEXT,

  icon TEXT,
  color TEXT,

  sort_order INTEGER DEFAULT 0,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (parent_id) REFERENCES memory_folders(id)
);
```

---

## 7.2 memory_files

```sql
CREATE TABLE memory_files (
  id TEXT PRIMARY KEY,

  folder_id TEXT NOT NULL,
  project_id TEXT,

  title TEXT NOT NULL,
  slug TEXT NOT NULL,

  summary TEXT NOT NULL,
  purpose TEXT,
  key_points TEXT,

  status TEXT NOT NULL,

  tags TEXT,

  importance INTEGER NOT NULL,
  confidence REAL NOT NULL,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT,

  node_count INTEGER DEFAULT 0,
  chunk_count INTEGER DEFAULT 0,

  FOREIGN KEY (folder_id) REFERENCES memory_folders(id)
);
```

---

## 7.3 memory_nodes

```sql
CREATE TABLE memory_nodes (
  id TEXT PRIMARY KEY,

  folder_id TEXT NOT NULL,
  file_id TEXT,
  project_id TEXT,
  conversation_id TEXT,

  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT NOT NULL,

  type TEXT NOT NULL,
  scope TEXT NOT NULL,

  tags TEXT,

  importance INTEGER NOT NULL,
  confidence REAL NOT NULL,

  origin TEXT NOT NULL,
  status TEXT NOT NULL,

  is_pinned INTEGER DEFAULT 0,
  user_editable INTEGER DEFAULT 1,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  use_count INTEGER DEFAULT 0,

  FOREIGN KEY (folder_id) REFERENCES memory_folders(id),
  FOREIGN KEY (file_id) REFERENCES memory_files(id)
);
```

---

## 7.4 memory_chunks

```sql
CREATE TABLE memory_chunks (
  id TEXT PRIMARY KEY,

  file_id TEXT NOT NULL,
  node_id TEXT,

  content TEXT NOT NULL,
  summary TEXT,

  chunk_index INTEGER NOT NULL,
  token_count INTEGER NOT NULL,

  embedding_id TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (file_id) REFERENCES memory_files(id),
  FOREIGN KEY (node_id) REFERENCES memory_nodes(id)
);
```

---

## 7.5 memory_edges

```sql
CREATE TABLE memory_edges (
  id TEXT PRIMARY KEY,

  from_type TEXT NOT NULL,
  from_id TEXT NOT NULL,

  to_type TEXT NOT NULL,
  to_id TEXT NOT NULL,

  relation TEXT NOT NULL,
  strength REAL NOT NULL,

  created_at TEXT NOT NULL
);
```

---

## 7.6 memory_embeddings

```sql
CREATE TABLE memory_embeddings (
  id TEXT PRIMARY KEY,

  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,

  embedding_model TEXT NOT NULL,
  vector BLOB NOT NULL,

  created_at TEXT NOT NULL
);
```

---

## 7.7 memory_events

```sql
CREATE TABLE memory_events (
  id TEXT PRIMARY KEY,

  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,

  event_type TEXT NOT NULL,

  old_value TEXT,
  new_value TEXT,

  source TEXT NOT NULL,

  created_at TEXT NOT NULL
);
```

---

## 7.8 memory_extraction_runs

```sql
CREATE TABLE memory_extraction_runs (
  id TEXT PRIMARY KEY,

  conversation_id TEXT NOT NULL,
  project_id TEXT,

  mode TEXT NOT NULL,
  status TEXT NOT NULL,

  proposed_count INTEGER DEFAULT 0,
  saved_count INTEGER DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  rejected_count INTEGER DEFAULT 0,

  created_at TEXT NOT NULL
);
```

---

## 8. Pseudo Tool Calling

Some local models may not support real tool calling well. The app should support pseudo tool calling.

The AI outputs structured JSON.  
The app reads it, runs the real memory operation, and returns the result.

---

## 8.1 memory.search

Search memory by folder, file, node, chunk, project, or semantic query.

```ts
memory.search({
  query: string
  projectId?: string
  folderIds?: string[]
  fileIds?: string[]
  types?: string[]
  limit?: number
  tokenBudget?: number
})
```

Example:

```json
{
  "tool": "memory.search",
  "args": {
    "query": "foldered memory file graph",
    "projectId": "veyra-regenter",
    "limit": 8,
    "tokenBudget": 700
  }
}
```

---

## 8.2 memory.folder.search

Search folder summaries first.

```ts
memory.folder.search({
  query: string
  projectId?: string
  limit?: number
})
```

---

## 8.3 memory.file.search

Search file summaries and key points.

```ts
memory.file.search({
  query: string
  folderIds?: string[]
  projectId?: string
  limit?: number
})
```

---

## 8.4 memory.file.open

Open a file overview.

```ts
memory.file.open({
  fileId: string
  includeNodes?: boolean
  includeChunks?: boolean
  nodeLimit?: number
  chunkLimit?: number
})
```

---

## 8.5 memory.node.get

Get a specific node.

```ts
memory.node.get({
  nodeId: string
})
```

---

## 8.6 memory.graph.expand

Expand related nodes.

```ts
memory.graph.expand({
  nodeIds: string[]
  maxDepth: number
  maxExtraNodes: number
  minEdgeStrength: number
})
```

---

## 8.7 memory.create

Create a memory node.

```ts
memory.create({
  title: string
  content: string
  summary?: string
  type: string
  scope: string
  folderPath?: string
  fileTitle?: string
  projectId?: string
  tags?: string[]
  importance: number
  confidence: number
})
```

---

## 8.8 memory.file.upsert

Create or update a memory file.

```ts
memory.file.upsert({
  folderPath: string
  fileTitle: string
  summary: string
  purpose?: string
  keyPoints?: string[]
  projectId?: string
  tags?: string[]
})
```

---

## 8.9 memory.link

Create an edge.

```ts
memory.link({
  fromType: "folder" | "file" | "node" | "chunk" | "project"
  fromId: string
  toType: "folder" | "file" | "node" | "chunk" | "project"
  toId: string
  relation: string
  strength: number
})
```

---

## 8.10 memory.pack

Build a compressed context block.

```ts
memory.pack({
  folderIds?: string[]
  fileIds?: string[]
  nodeIds?: string[]
  chunkIds?: string[]
  tokenBudget: number
  style: "compact" | "bullet" | "detailed"
})
```

---

## 8.11 memory.extract_after_chat

Run automatic memory extraction after a chat.

```ts
memory.extract_after_chat({
  conversationId: string
  projectId?: string
  mode: "manual_only" | "safe_auto_save" | "review_all" | "aggressive_project_memory"
  maxMemories: number
})
```

---

## 9. Retrieval Flow

## 9.1 Normal Retrieval

```text
User sends message
    ↓
Memory router decides memory is needed
    ↓
Search folder summaries
    ↓
Search file summaries in top folders
    ↓
Open top files
    ↓
Search nodes/chunks inside selected files
    ↓
Expand graph if needed
    ↓
Rank candidates
    ↓
Compress into memory pack
    ↓
Inject memory pack into prompt
```

---

## 9.2 Example Retrieval

User:

```text
Make the memory UI match the app style we talked about.
```

Memory router:

```json
{
  "needsMemory": true,
  "reason": "User refers to previous UI style decisions.",
  "queries": [
    "Veyra Regenter UI style",
    "memory UI design",
    "minimal UI advanced settings hidden"
  ]
}
```

Folder search finds:

```text
Projects / Veyra Regenter / UI UX
Projects / Veyra Regenter / Memory System
```

File search finds:

```text
ui-decisions.mem
memory-ui-design.mem
foldered-memory-file-graph.mem
```

Node retrieval finds:

```text
User prefers minimal UI.
Advanced model settings should be hidden.
Tools should be side toggles.
Memory page should have folders, files, nodes, and graph view.
```

Final memory pack:

```text
Relevant memory:
- User is designing Veyra Regenter, a local-first AI desktop app.
- UI should be minimal, clean, and not overwhelming.
- Advanced settings should be hidden unless needed.
- Tools should appear as side toggles.
- Memory UI should use folders, files, nodes, and a detail panel.
```

---

## 10. Automatic Memory After Each Chat

After every chat, the app should run an extraction pass.

```text
Chat ends
    ↓
AI scans conversation
    ↓
AI proposes memory updates
    ↓
System checks duplicates/conflicts
    ↓
AI assigns folder and file
    ↓
Safe memories are auto-saved
    ↓
Uncertain memories go to Inbox
    ↓
File summaries update
    ↓
Folder summaries update
    ↓
Edges are created
```

---

## 10.1 Extraction Rules

Auto-save:

```text
Clear project decisions
Explicit user preferences
Stable app goals
Technical stack choices
Important design decisions
Repeated corrections
```

Needs review:

```text
Inferred user preferences
Personal facts
Low-confidence guesses
Possible duplicates
Conflicts
```

Do not save:

```text
Random one-time details
Sensitive information without approval
Full raw conversations
Temporary context
Duplicate facts
```

---

## 10.2 Extraction Output Format

```json
{
  "proposedMemories": [
    {
      "title": "Memory uses folders, files, and nodes",
      "content": "The memory system should use folders for broad organization, files for topic overviews, and nodes/chunks for deeper retrieval.",
      "summary": "Folders organize, files summarize, nodes store detailed memories.",
      "type": "decision",
      "scope": "project",
      "folderPath": "Projects/Veyra Regenter/Memory System",
      "fileTitle": "Foldered Memory File Graph",
      "tags": ["memory", "folders", "files", "nodes"],
      "importance": 5,
      "confidence": 1.0,
      "status": "approved"
    }
  ]
}
```

---

## 11. Memory UI Specification

## 11.1 Main Layout

```text
Memory Page
├─ Left Sidebar
│  ├─ All Memory
│  ├─ Inbox
│  ├─ Pinned
│  ├─ Recent
│  ├─ Global Memory
│  ├─ Projects
│  ├─ Smart Folders
│  └─ Archived
│
├─ Main Panel
│  ├─ Search Bar
│  ├─ Filter Chips
│  ├─ Sort Menu
│  ├─ Folder/File Breadcrumbs
│  └─ Memory Cards / File Cards
│
└─ Right Detail Panel
   ├─ Summary
   ├─ Full Content
   ├─ Tags
   ├─ Linked Nodes
   ├─ Source Conversation
   ├─ Confidence
   ├─ Importance
   ├─ Last Used
   └─ Edit / Pin / Move / Archive / Delete
```

---

## 11.2 Views

The memory page should support multiple views:

```text
Folder View
File View
Node List View
Graph View
Inbox Review View
```

---

## 11.3 Folder View

Shows:

- child folders
- files
- folder summary
- memory count
- last updated
- project association

---

## 11.4 File View

Shows:

- file title
- summary
- purpose
- key points
- nodes
- chunks
- linked files
- source conversations

---

## 11.5 Node Detail View

Shows:

- full memory content
- summary
- type
- scope
- tags
- folder
- file
- linked nodes
- confidence
- importance
- source
- last used
- edit history

---

## 11.6 Graph View

Graph view should visualize:

- folders
- files
- nodes
- edges
- related memory clusters

It should have filters:

- show only current project
- show only selected folder
- show only linked nodes
- hide archived
- hide low confidence

---

## 11.7 Memory Used Dropdown

Every AI response should include a small dropdown:

```text
Memory used in this response
```

It should show:

- memory pack summary
- source folders
- source files
- source nodes
- token count
- why each memory was used

---

## 12. Settings

## 12.1 Simple Settings

```text
Memory Mode:
- Off
- Manual Only
- Auto-Save Safe Memories
- Ask Before Saving Anything
- Aggressive Project Memory
```

Recommended default:

```text
Auto-Save Safe Memories
```

---

## 12.2 Advanced Settings

Hide these by default.

```text
Max memories extracted per chat
Max memory tokens per response
Max graph depth
Require review for inferred memories
Require review for personal information
Auto-create folders
Auto-create files
Auto-update folder summaries
Auto-update file summaries
Merge duplicates automatically
Detect conflicts automatically
Archive unused low-value memories
```

---

## 13. Token Budgets

Recommended defaults:

```ts
const memoryBudgets = {
  casualChat: {
    maxMemoryTokens: 300,
    maxFiles: 2,
    maxNodes: 5,
    maxGraphDepth: 0
  },

  normalProject: {
    maxMemoryTokens: 700,
    maxFiles: 4,
    maxNodes: 10,
    maxGraphDepth: 1
  },

  deepProjectWork: {
    maxMemoryTokens: 1500,
    maxFiles: 8,
    maxNodes: 20,
    maxGraphDepth: 2
  },

  agentWorkflow: {
    maxMemoryTokens: 2500,
    maxFiles: 12,
    maxNodes: 35,
    maxGraphDepth: 2
  }
}
```

Default should be `normalProject` for active project chats and `casualChat` for normal chats.

---

## 14. Prompt Packing Order

Final prompt should be built in this order:

```text
1. System prompt
2. Active project settings
3. Relevant user settings
4. Compressed memory pack
5. Conversation summary if needed
6. Recent messages
7. Current user message
```

Do not use:

```text
System prompt
+ all memories
+ all files
+ all project notes
+ full chat history
+ current user message
```

---

## 15. Duplicate and Conflict Handling

## 15.1 Duplicate Detection

Before saving a memory, compare against existing nodes.

Duplicate signals:

- high semantic similarity
- same folder/file
- same tags
- same project
- similar title
- same source conversation

Actions:

```text
Merge
Update existing memory
Create new linked memory
Send to Inbox
Reject duplicate
```

---

## 15.2 Conflict Detection

If a new memory contradicts an old one, mark both.

Example:

```text
Old: Tools should be bottom controls.
New: Tools should be side toggles.
```

The new memory should update or supersede the old one.

Possible edge:

```text
[Tools should be side toggles] updates [Tools should be bottom controls]
```

---

## 16. Permissions and Safety

The AI should not have unrestricted memory access.

Recommended permission model:

```ts
type MemoryPermission =
  | "read"
  | "propose_create"
  | "auto_create_low_risk"
  | "update_with_confirmation"
  | "delete_with_confirmation"
```

Default behavior:

```text
AI can search memory automatically.
AI can create explicit memories when user asks.
AI can auto-save safe project decisions.
AI can propose inferred memories.
AI cannot delete memory without confirmation.
AI cannot save sensitive personal information without approval.
```

---

## 17. Example Folder/File/Node Setup

```text
Memory
└─ Projects
   └─ Veyra Regenter
      ├─ Overview
      │  └─ project-overview.mem
      │
      ├─ UI / UX
      │  ├─ ui-style.mem
      │  ├─ sidebar-tools.mem
      │  └─ advanced-settings-visibility.mem
      │
      ├─ Memory System
      │  ├─ memory-overview.mem
      │  ├─ foldered-memory-file-graph.mem
      │  ├─ pseudo-tool-calling.mem
      │  ├─ auto-memory-after-chat.mem
      │  └─ context-budget-rules.mem
      │
      ├─ Model Providers
      │  ├─ lm-studio-provider.mem
      │  └─ openai-compatible-provider.mem
      │
      ├─ Tools
      │  └─ tool-toggle-design.mem
      │
      └─ Agents
         └─ agent-toggle-design.mem
```

Example file:

```text
File: foldered-memory-file-graph.mem

Summary:
The memory system uses folders for organization, files for broad overviews, nodes/chunks for detailed retrieval, and edges for relationship mapping.

Key Points:
- Folders organize broad memory areas.
- Files give the AI topic-level summaries.
- Nodes store individual reusable memories.
- Chunks make longer files searchable.
- Edges connect related memories.
- Only compressed memory packs enter model context.
```

Example nodes:

```text
Node: Files provide broad overview
Content: Memory files should summarize a focused topic so the AI can understand the area before retrieving deeper nodes.

Node: Nodes store detailed facts
Content: Nodes should store individual reusable facts, decisions, preferences, or instructions.

Node: Memory packs protect context
Content: The final prompt should include only a compressed memory pack, not full memory files or all nodes.
```

---

## 18. MVP Build Plan

## Version 0.1 — Manual Memory

Build:

- memory folders
- memory files
- manual memory creation
- memory page
- basic search
- pin/archive/delete
- project association

Skip:

- graph view
- auto extraction
- complex ranking

---

## Version 0.2 — Retrieval and Memory Packs

Build:

- folder summary search
- file summary search
- node retrieval
- memory ranking
- memory compression
- memory pack injection
- memory used dropdown

---

## Version 0.3 — Auto Memory After Chat

Build:

- post-chat extraction
- suggested memories
- memory inbox
- auto-save safe memories
- review uncertain memories
- duplicate detection

---

## Version 0.4 — Memory Graph

Build:

- memory edges
- graph expansion
- related nodes
- conflict edges
- update/supersede edges
- basic graph view

---

## Version 0.5 — Smart Organization

Build:

- smart folders
- auto folder assignment
- auto file creation
- file summary updates
- folder summary updates
- cleanup suggestions

---

## Version 0.6 — Advanced Memory

Build:

- long-term decay
- conflict resolver
- memory timeline
- import/export
- project memory packs
- agent workflow memory
- advanced permissions

---

## 19. Acceptance Criteria

The system is working when:

1. The user can create folders and files for memory.
2. The AI can search folder summaries before opening files.
3. The AI can retrieve exact nodes/chunks from relevant files.
4. The AI can build a compressed memory pack.
5. The app never injects all memory into context.
6. The user can see which memories were used.
7. The AI can auto-extract useful memories after each chat.
8. Safe memories can be auto-saved.
9. Uncertain memories go to the Inbox.
10. Project memory stays scoped to the active project.
11. Duplicate and conflicting memories are handled.
12. Memory remains useful as the app grows.

---

## 20. Final Product Description

**Foldered Memory File Graph** is a scalable memory system for a local-first AI app.

It organizes memory into folders, stores topic-level overviews as files, saves detailed reusable knowledge as nodes and chunks, connects related information with graph edges, and retrieves memory through pseudo tool calls.

The AI first scans broad folder and file summaries, then jumps deeper into nodes or chunks only when needed. After each chat, it extracts useful memories, files them automatically, updates summaries, and sends uncertain memories to a review inbox.

Only a compressed, token-limited memory pack is inserted into the model prompt.

This gives the AI long-term memory without overflowing context.
