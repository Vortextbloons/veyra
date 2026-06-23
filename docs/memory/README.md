# Memory Module

Local-first memory system with 5 modes and 10 node types. Provides persistent knowledge that survives across conversations.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/memory/memory-types.ts` | Type definitions |
| `src/modules/memory/memory-store.ts` | Zustand store for CRUD |
| `src/modules/memory/memory-extraction.ts` | LLM-based memory extraction from chat |
| `src/modules/memory/memory-retrieval.ts` | Relevance-based memory retrieval |
| `src/modules/memory/memory-router.ts` | Decides when to run retrieval |
| `src/modules/memory/memory-retention.ts` | Automatic cleanup and eviction |
| `src/modules/memory/memory-storage.ts` | Tauri IPC layer |
| `src/modules/memory/profile-config.ts` | User profile setup (7 categories, 21 questions) |
| `src/modules/memory/profile-helpers.ts` | Profile memory identification |

## Memory Modes

| Mode | Behavior |
|------|----------|
| `off` | No extraction or retrieval |
| `manual_only` | Only explicit "remember this" saves |
| `safe_auto_save` | Auto-save high-confidence extractions |
| `review_all` | Extract everything, require manual approval |
| `aggressive_project_memory` | Maximum extraction with project scoping |

## Memory Node Types

| Type | Description |
|------|-------------|
| `preference` | User preferences and habits |
| `project` | Project-level information |
| `project_fact` | Factual project details |
| `decision` | Decisions made during conversation |
| `instruction` | User instructions for the AI |
| `summary` | Conversation summaries |
| `task` | Tasks and to-dos |
| `idea` | Ideas and brainstorming |
| `file_reference` | References to files |
| `temporary_context` | Short-lived contextual info |

## Memory Priorities

| Priority | Description |
|----------|-------------|
| `permanent` | Never auto-archived |
| `high` | Rarely evicted |
| `medium` | Standard retention |
| `low` | Evicted when over capacity |
| `ephemeral` | 7-day TTL, first to be evicted |

## Scopes

| Scope | Description |
|-------|-------------|
| `global` | Available across all conversations |
| `project` | Scoped to a specific project |
| `conversation` | Scoped to a single conversation |
| `session` | Ephemeral, current session only |

## How It Works

### Extraction (Post-Chat)
1. After chat turns, `shouldExtractMemoryBatch()` checks if enough new messages exist (min 4 messages, 2 exchanges)
2. `runMemoryExtractionBatch()` sends the transcript to the LLM
3. LLM outputs JSON with memory candidates
4. Deduplication: text similarity + optional vector similarity against existing memories
5. High-confidence items are auto-saved; others require review
6. Batch size capped at 16 messages; 90-second pending threshold

### Retrieval (Pre-Chat)
1. `memory-router.ts` detects if memory retrieval is needed (looks for cues like "remember", "my name", etc.)
2. Skips greetings, trivial math, and very short messages
3. `buildMemoryPackWithInfo()` searches for candidates:
   - **Durable seeds**: High-priority pinned/permanent memories
   - **Vector search**: Optional semantic similarity (requires external endpoint)
   - **Keyword search**: BM25-style keyword matching
4. Multi-factor scoring:
   - Keyword match score
   - Importance and confidence ratings
   - Pinned boost
   - Recency and use-count boosts
   - Project and category alignment
   - Profile-aware boosting
5. Noise floor filtering removes low-relevance candidates
6. Binary search trims results to fit within the token budget

### Retention (Periodic)
- Archives expired ephemeral nodes (7-day TTL)
- Evicts low-priority overflow:
  - 200 global nodes max
  - 100 nodes per project
  - 30 nodes per conversation

### Protected Memories
The following are never auto-archived:
- Pinned memories
- Permanent priority
- Importance >= 5
- Explicit user saves
- Manual edits
- Profile setup nodes

## Profile Setup

User profile with 7 categories and 21 questions:
- **Identity**: Name, pronouns, location
- **Communication**: Preferred tone, formality level
- **Expertise**: Technical skills, domains
- **Interests**: Hobbies, topics of interest
- **Work**: Job role, projects
- **Learning**: Current learning goals
- **Preferences**: UI, AI behavior preferences

Profile responses become structured memory nodes that boost retrieval for relevant queries.
