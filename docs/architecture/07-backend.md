# Tauri Backend

## Rust Modules (13 total)

| Module | Purpose |
|--------|---------|
| `agents/` | Pi CLI integration |
| `characters/` | Character and group CRUD, I/O commands, avatar management |
| `code_execution/` | Python sandbox (check + execute) |
| `connectivity/` | Network connectivity probe |
| `document_extraction` | Document text extraction utility |
| `documents/` | Document CRUD, versions, export, folders |
| `email/` | Gmail OAuth, IMAP, AI jobs, drafts, tags |
| `file_extraction/` | PDF, DOCX, PPTX, XLSX extraction |
| `memory/` | Memory CRUD, BM25 + vector search, embeddings |
| `projects/` | Project CRUD, manifest export |
| `research/` | Research run, step, source, evidence, claim, contradiction, report CRUD |
| `shared/` | SQLite connection, migrations, encryption keys |
| `web_search/` | SearXNG Docker management, page fetching |

## Command Count

**~140 Tauri commands** registered across all modules. Key counts:
- Agents: 6 commands
- Code execution: 2 commands
- Memory: 14 commands
- Connectivity: 1 command
- Web search: 9 commands
- Documents: 16 commands
- Email: 47 commands
- Projects: 6 commands
- Research: 16 commands
- Characters: 18 commands
- File extraction: 1 command
- Core (conversations, credentials, app lifecycle): 9 commands

## Storage

- SQLite database for structured data
- JSON files for conversations (encrypted)
- localStorage for settings and agent sessions

## App Lifecycle

### Startup (`src/lib/startup.ts`)
1. Initialize Tauri IPC
2. Load settings from localStorage
3. Connect to LM Studio
4. Load characters, projects, documents
5. Check Pi CLI availability
6. Initialize web search (check Docker/SearXNG)

### Shutdown (`src/lib/app-shutdown.ts`)
1. Unload all AI models
2. Interrupt running research
3. Flush pending saves
4. Close SQLite connections

## Key Files

| File | Purpose |
|------|---------|
| `src-tauri/src/lib.rs` | Tauri application setup and command registration |
| `src/lib/startup.ts` | App initialization sequence |
| `src/lib/app-shutdown.ts` | Graceful shutdown |
| `src/lib/app-update.ts` | Update checking |
