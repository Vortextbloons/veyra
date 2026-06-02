# AI App Framework Plan

## 1. App Vision

The app is a modular AI workspace built around local-first AI models, with LM Studio as the primary model provider. The app should also support external OpenAI-compatible providers so users can switch between local models and cloud models without rewriting the app.

The first feature will be a simple chat system, but the architecture must be designed for many future features such as memory, tools, files, agents, workflows, automation, project spaces, and model routing.

The core goal is to make an AI app that is flexible, fast, private, expandable, and not locked to one AI provider.
Core Tech Stack
App Shell

Tauri v2

Use Tauri for the desktop app wrapper.

Why:

Lightweight compared to Electron
Good for local-first apps
Rust backend for native features
Works well with local files, SQLite, and system access
Great fit for an LM Studio-focused desktop AI app
Frontend

React 19 + TypeScript 6 + Vite 8

Use this for the main app UI.

Why:

Fast development
Strong component ecosystem
Works great with Tauri
TypeScript helps keep a big app organized
Vite gives fast dev builds
UI / Styling

Tailwind CSS 4 + shadcn/ui

Use this for the interface.

Why:

Clean modern UI
Easy dark mode
Good for dashboard-style layouts
Components are customizable
Fits the mockup style you are making
State Management

Zustand 5

Global state for chat, providers, memory, and settings stores.

Database

SQLite via rusqlite (Rust side) with FTS5 full-text search for memory retrieval. Conversations are stored as encrypted JSON (AES-GCM) via Tauri commands with a key stored in the app data directory.

---

# 2. Core Design Principles

## Local-first by default

The app should work best with local models through LM Studio. User conversations, memory, settings, and app data should be stored locally unless the user chooses cloud sync later.

## Provider-flexible

The app should not be hardcoded for one AI company. It should use a model provider layer that supports:

* LM Studio local models
* OpenAI-compatible APIs
* OpenAI official API
* Other external providers later
* Custom base URL providers
* Per-model settings

## Context-efficient memory

The memory system should not dump everything into the prompt. It should retrieve only the most useful memories for the current message.

Memory should be summarized, ranked, filtered, and compressed before being added to context.

## Modular feature system

Every major feature should be built as a module so the app can grow without becoming messy.

Examples:

* Chat module
* Memory module
* Model provider module
* Tool module
* File module
* Agent module
* Workflow module
* Settings module
* Project module

## User control

The user should always be able to view, edit, disable, delete, or pin memories. The app should not secretly store important information without showing it somewhere.

---

# 3. Main Architecture

## App Layers

### 1. User Interface Layer

This is what the user sees.

Main screens:

* Chat
* Conversations
* Memory
* Models
* Settings
* Tools
* Projects
* Future feature panels

For the first version, only Chat, Models, Settings, and Memory Debug/View are needed.

### 2. App Logic Layer

This handles the main app behavior.

Responsibilities:

* Create conversations
* Send messages
* Stream AI responses
* Save chat history
* Decide which provider/model to use
* Ask the memory system for relevant memory
* Format the final prompt
* Handle errors
* Track token/context budget
* Auto-name conversations
* Summarize long conversations
* Extract memories in background
* Schedule background model jobs

### 3. AI Provider Layer

This is a provider adapter system.

Every provider should follow one internal interface:

```ts
ProviderAdapter.isAvailable()
ProviderAdapter.fetchModels()
ProviderAdapter.sendChat(options)
ProviderAdapter.reconnect?()
ProviderAdapter.startServer?()
```

Provider adapters:

* LM Studio adapter (implemented)
* OpenAI-compatible adapter (planned)
* OpenAI official adapter (planned)
* Future Anthropic/Gemini/custom adapters

The rest of the app should not care which provider is being used.

### 4. Memory Layer

This stores and retrieves useful user/context information.

Memory should be separate from chat history. Chat history is the full record. Memory is the compressed, reusable knowledge extracted from past activity.

The memory system is organized in a three-tier hierarchy:

* **MemoryFolder** — organizational container (e.g. "General", project-specific)
* **MemoryFile** — grouped knowledge document within a folder
* **MemoryNode** — individual memory unit within a file

### 5. Storage Layer

Local storage should contain:

* Conversations (encrypted JSON via Tauri commands)
* Messages (within conversation objects)
* Memories (SQLite with FTS5 full-text search)
* Model configs (localStorage)
* Provider configs (localStorage)
* User settings (localStorage)
* Tool settings
* App logs
* Future project data

A good structure would be:

* Encrypted JSON files for conversations (AES-GCM, key stored locally)
* SQLite for structured memory data with FTS5 for semantic search
* File storage for attachments later

---

# 4. First Major Feature: Simple Chat

## Goal

Build a clean chat system that can talk to LM Studio first, then later support external models.

## Required Chat Features

### Conversation list

The app should allow users to create, rename, search, archive, and delete conversations.

### Message stream

The assistant response should stream token-by-token when supported.

### Model selector

The user should be able to pick:

* Provider
* Model
* Temperature
* Max tokens
* Context size
* System prompt
* Streaming on/off

### Message actions

Each message should support:

* Copy
* Edit
* Regenerate
* Delete
* Continue response
* Fork conversation from message
* Retry with different model

### Basic prompt structure

Every AI request should be built from:

1. System prompt
2. Relevant user settings
3. Relevant memory
4. Conversation summary if needed
5. Recent messages
6. Current user message

The app should not send the entire history forever. Older conversation should be summarized when needed.

---

# 5. Memory System Framework

## Purpose

The memory system should help the AI remember useful things without filling the context window with unnecessary information.

It should remember stable, reusable information such as:

* User preferences
* Long-term projects
* Coding style preferences
* App settings
* Important facts the user explicitly saved
* Repeated corrections
* Current project goals
* Important previous decisions

It should avoid storing:

* Random one-time messages
* Sensitive information without user approval
* Temporary details
* Duplicate facts
* Full raw conversations
* Low-confidence assumptions

---

## Memory Types

### Node Types (what the memory is about)

* `preference` — user preference or style
* `project` / `project_fact` — project-specific information
* `decision` — a decision that was made
* `instruction` — explicit user instruction
* `summary` — compressed conversation summary
* `task` — task-related information
* `idea` — idea or thought
* `file_reference` — reference to a file
* `temporary_context` — short-lived context

### Memory Scope (where the memory lives)

* `global` — applies everywhere
* `project` — tied to a specific project
* `conversation` — tied to a specific conversation
* `session` — temporary, current session only

### Memory Origin (how the memory was created)

* `explicit_user_save` — user said "remember this"
* `auto_extracted` — LLM extracted from conversation
* `manual_user_edit` — user manually edited
* `imported` — imported from external source

### Memory Priority

* `permanent` — always included
* `high` — strongly preferred
* `medium` — normal priority
* `low` — low priority, cleaned up first
* `ephemeral` — temporary, auto-expires after 7 days

### Memory Status

* `active` — live and used in retrieval
* `needs_review` — awaiting user approval (inferred memories)
* `approved` — user confirmed
* `rejected` — user rejected
* `archived` — soft-deleted, not used in retrieval

---

# 6. Context-Efficient Memory Pipeline

The memory system works like this:

## Step 1: Receive user message

The user sends a message in chat.

## Step 2: Decide whether memory is needed

A memory router checks:

* Is this message related to user preferences?
* Is it related to an existing project?
* Is it asking to continue previous work?
* Does it need long-term context?
* Is it just a simple question?

If memory is not needed (e.g. greetings, trivial math, short messages), the app sends no memory.

## Step 3: Search memory

If memory is needed, search memories by:

* Keyword match (FTS5 full-text search with bm25 ranking)
* Title match
* Tag match
* Recency
* Importance
* User-pinned status

## Step 4: Rank memory

Each memory gets a score based on:

* Keyword relevance to current message
* Title match
* Tag match
* Importance (1-5 scale)
* Confidence (0-1 scale)
* Whether it belongs to the active project
* Whether the user pinned it
* Recency boost (last used within 1/7/30 days)
* Use count boost

## Step 5: Compress memory

Do not send raw memories directly if there are too many. Instead, merge them into a short "memory context block."

Example:

```text
Relevant memory:
- User is building an AI app focused on LM Studio and OpenAI-compatible models.
- The first feature is simple chat.
- User wants memory to be efficient and not fill too much context.
```

## Step 6: Apply token budget

Memory should have a strict budget.

Example:

* Small chat: 300–700 tokens of memory max
* Project chat: 700–1,500 tokens of memory max
* Deep work mode: 1,500–3,000 tokens max

Default should be small (700 tokens).

## Step 7: Send final prompt

The final prompt should include only the best memory, not everything.

---

# 7. Memory Storage Schema

## Memory Folder Table

```text
id           TEXT PRIMARY KEY
name         TEXT NOT NULL
parent_id    TEXT
project_id   TEXT
folder_type  TEXT NOT NULL (manual|project|system|smart)
description  TEXT
summary      TEXT
sort_order   INTEGER
created_at   TEXT
updated_at   TEXT
```

## Memory File Table

```text
id           TEXT PRIMARY KEY
folder_id    TEXT NOT NULL (FK → memory_folders)
project_id   TEXT
title        TEXT NOT NULL
slug         TEXT NOT NULL
summary      TEXT
purpose      TEXT
key_points   TEXT (JSON array)
status       TEXT (active|draft|needs_review|archived)
tags         TEXT (JSON array)
importance   INTEGER (1-5)
confidence   REAL (0-1)
created_at   TEXT
updated_at   TEXT
node_count   INTEGER
chunk_count  INTEGER
```

## Memory Node Table

```text
id                   TEXT PRIMARY KEY
folder_id            TEXT NOT NULL (FK → memory_folders)
file_id              TEXT
project_id           TEXT
conversation_id      TEXT
title                TEXT NOT NULL
content              TEXT
summary              TEXT
node_type            TEXT (preference|project|project_fact|decision|instruction|summary|task|idea|file_reference|temporary_context)
scope                TEXT (global|project|conversation|session)
tags                 TEXT (JSON array)
importance           INTEGER (1-5)
confidence           REAL (0-1)
priority             TEXT (permanent|high|medium|low|ephemeral)
expires_at           TEXT
source_message_ids   TEXT (JSON array)
extraction_batch_id  TEXT
duplicate_of         TEXT
contradiction_of     TEXT
origin               TEXT (explicit_user_save|auto_extracted|manual_user_edit|imported)
status               TEXT (active|needs_review|approved|rejected|archived)
is_pinned            INTEGER (0|1)
user_editable        INTEGER (0|1)
created_at           TEXT
updated_at           TEXT
last_used_at         TEXT
use_count            INTEGER
```

## Full-Text Search

SQLite FTS5 virtual table indexes `title`, `content`, `summary`, and `tags` from memory_nodes. Triggers keep the FTS index in sync on INSERT, UPDATE, and DELETE.

## Indexes

```text
idx_memory_nodes_status     ON memory_nodes(status)
idx_memory_nodes_scope      ON memory_nodes(scope)
idx_memory_nodes_folder     ON memory_nodes(folder_id)
idx_memory_nodes_pinned     ON memory_nodes(is_pinned)
idx_memory_nodes_project    ON memory_nodes(project_id)
idx_memory_nodes_type       ON memory_nodes(node_type)
idx_memory_nodes_file       ON memory_nodes(file_id)
idx_memory_nodes_updated    ON memory_nodes(updated_at)
idx_memory_nodes_search_order ON memory_nodes(status, is_pinned, importance, updated_at)
```

---

# 8. Memory Controls

The app should include a Memory page where users can:

* View all memories
* Search memories
* Edit memories
* Delete memories
* Pin memories
* Disable memory
* Disable inferred memory
* Export memory
* Import memory
* Clear project memory
* Clear all memory

A "memory used in this response" dropdown should show which memories were used for a given AI response. This makes the system transparent and easier to debug.

---

# 9. Model Provider System

## Provider Config

Each provider should have a config like:

```text
provider_id
provider_name
provider_type
base_url
api_key
default_model
supports_streaming
supports_tools
supports_images
supports_embeddings
supports_json_mode
supports_reasoning
```

## Provider Types

### LM Studio

Primary local provider.

Used for:

* Local chat
* Local models
* Private workflows
* Offline work when possible

### OpenAI-Compatible Provider

Generic adapter for providers that follow OpenAI-style APIs.

User provides:

* Base URL
* API key
* Model name

### OpenAI Official

Dedicated adapter for OpenAI APIs.

Useful because official OpenAI features may differ from generic compatibility APIs.

### Future Providers

Possible later adapters:

* Anthropic
* Google Gemini
* Groq
* Together
* Ollama
* OpenRouter
* Custom HTTP provider

---

# 10. Internal Request Format

The app should convert all messages into one internal format before sending them to any provider.

Example internal format:

```text
ProviderChatOptions:
- messages
- model
- temperature
- contextLength
- previousResponseId
- signal (AbortSignal)
- onChunk
- onReasoningChunk
- onComplete
- onError
```

Then each provider adapter converts that internal format into the provider's actual API format.

This keeps the app clean and prevents provider-specific code from spreading everywhere.

---

# 11. First Version Roadmap

## Version 0.1 — Basic Local Chat

Goal: Prove the chat loop works.

Features:

* Connect to LM Studio
* Send message
* Stream response
* Save conversation
* Basic model settings
* Error handling
* Basic conversation list

## Version 0.2 — Provider Settings

Goal: Support more model backends.

Features:

* Add provider manager
* Add custom OpenAI-compatible provider
* Store base URL and API key
* Test provider connection
* List models when supported
* Per-provider default settings

## Version 0.3 — Basic Memory

Goal: Add simple but safe memory.

Features:

* Manual "remember this" memory
* Memory page
* Search memories
* Inject top relevant memories into prompt
* Token budget for memory
* Show which memories were used

## Version 0.4 — Smarter Memory

Goal: Make memory useful without context bloat.

Features:

* Conversation summaries
* Project memory
* Memory ranking
* Memory compression
* Duplicate memory detection
* Memory confidence score
* User approval for inferred memories

## Version 0.5 — Project Spaces

Goal: Organize work.

Features:

* Create projects
* Attach chats to projects
* Project-specific memory
* Project settings
* Project system prompt
* Project files later

## Version 0.6 — Tools and Extensions

Goal: Prepare for bigger features.

Features:

* Tool registry
* Tool permission system
* Local tools
* Web/API tools
* File tools
* Code tools
* Future agent tools

---

# 12. Future Feature Ideas

## Chat Features

* Branching conversations
* Compare model responses
* Multi-model mode
* Prompt presets
* Character/persona presets
* Chat folders
* Search all chats
* Export chats
* Import chats

## Memory Features

* Memory graph
* Auto memory cleanup
* Memory conflict detection
* Memory timeline
* Project memory packs
* Temporary memory mode
* Private/incognito chat mode
* Memory approval queue

## Model Features

* Model benchmark panel
* Model profiles
* Auto model routing
* Cheap/fast/smart routing
* Local fallback model
* Cloud fallback model
* Per-task model selection

## Agent Features

* Planning agent
* Coding agent
* Research agent
* File agent
* Refactor agent
* Debug agent
* Long-task agent
* Multi-agent workflow builder

## Tool Features

* Local file search
* Code execution
* Browser/search tool
* API connector tool
* Notes tool
* Calendar/email tools
* Database query tool
* Minecraft add-on helper tools

## Workspace Features

* Notes
* Documents
* Projects
* Knowledge bases
* Prompt library
* Workflow builder
* Automation rules
* Task boards

---

# 13. Recommended First Build Order

## Build 1: App shell

Create the basic layout:

* Sidebar
* Chat panel
* Settings panel
* Model selector
* Conversation list

## Build 2: LM Studio chat

Make the app talk to LM Studio.

Must support:

* Send messages
* Stream responses
* Handle connection errors
* Save messages

## Build 3: Provider abstraction

Move AI calls behind a provider interface.

This prevents the app from becoming locked to LM Studio.

## Build 4: Basic memory

Add manual memory first.

Commands:

* "Remember this"
* "Forget this"
* "What do you remember?"
* "Use this for this project"

## Build 5: Memory retrieval

Add relevance search and memory injection.

Rules:

* Never inject all memory
* Use a token budget
* Prefer project memory
* Prefer pinned memory
* Prefer recent and important memory

## Build 6: Memory management UI

Add a memory page so the user can manage everything.

---

# 14. MVP Definition

The MVP should not try to include every future idea.

The first real MVP should include:

* Local LM Studio chat
* Conversation history
* Streaming responses
* Provider settings
* Custom OpenAI-compatible provider support
* Manual memory
* Memory search
* Memory injection with token budget
* Memory management page
* Basic project support or project-ready database structure

The MVP is successful if the user can:

1. Open the app.
2. Connect to LM Studio.
3. Chat with a local model.
4. Save conversations.
5. Save important memories.
6. Have the AI use only relevant memories.
7. Add another OpenAI-compatible provider later without rebuilding the app.

---

# 15. Core Technical Rule

The app should treat chat, memory, tools, providers, and future agents as separate systems.

Bad design:

```text
Chat directly talks to LM Studio, directly reads all memory, directly formats prompts, and directly handles every feature.
```

Good design:

```text
Chat calls the app orchestrator.
The orchestrator asks the memory system for relevant memory.
The orchestrator builds the prompt.
The provider adapter sends the request.
The storage layer saves the result.
```

This makes the app much easier to expand later.

---

# 16. Simple App Flow

```text
User sends message
        ↓
Chat UI sends request to app orchestrator
        ↓
Orchestrator checks active conversation and project
        ↓
Memory router decides whether memory is needed
        ↓
Memory search returns relevant memories
        ↓
Prompt builder creates final request
        ↓
Provider adapter sends request to LM Studio or external AI
        ↓
Response streams back to UI
        ↓
Conversation and metadata are saved
        ↓
Memory extractor decides whether anything should be saved
```

---

# 17. Final Product Direction

This app should start as a simple chat app but be designed like an AI operating system.

The first version should be small, but the foundation should support:

* Local AI
* Memory
* Projects
* Tools
* Agents
* Workflows
* Files
* Automation
* Multi-model routing

The most important early decision is to keep the provider system, memory system, and chat system separate. That will make it possible to add many future features without rewriting the whole app.
