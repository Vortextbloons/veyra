# Tauri Backend

## Rust Modules (13 total)

| Module | Purpose |
|--------|---------|
| `agents/` | Pi CLI integration |
| `app_update` | Application auto-update download, validation, installer launch |
| `characters/` | Character and group CRUD, I/O commands, avatar management |
| `connectivity/` | Network connectivity probe |
| `document_extraction` | Document text extraction utility |
| `documents/` | Document CRUD, versions, export, folders |
| `extensions/` | MCP server discovery and invocation |
| `file_extraction/` | PDF, DOCX, PPTX, XLSX extraction |
| `memory/` | Memory CRUD, BM25 + vector search, embeddings |
| `projects/` | Project CRUD, manifest export |
| `research/` | Research run, step, source, evidence, claim, contradiction, report CRUD |
| `shared/` | SQLite connection, migrations, encryption keys |
| `web_search/` | SearXNG Docker management, page fetching |

## Command Count

**~105 Tauri commands** registered across all modules. Key counts:
- Agents: 3 commands
- App update: 1 command
- Memory: 12 commands
- Connectivity: 1 command
- Web search: 14 commands
- Documents: 15 commands
- Projects: 5 commands
- Research: 15 commands
- Characters: 17 commands
- Extensions: 14 commands
- File extraction: 1 command
- Core (conversations, credentials, app lifecycle): 8 commands

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
