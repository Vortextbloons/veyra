# Veyra - Overview

Veyra is a **local-first AI desktop workspace** built with Tauri v2, React, TypeScript, Vite, and Zustand. It runs AI models locally via LM Studio and keeps all data on your machine.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 (Rust backend) |
| Frontend | React 19, TypeScript, Vite 8 |
| Styling | Tailwind CSS 4 |
| State | Zustand 5 |
| AI provider | LM Studio (local) |
| Persistence | SQLite (via Tauri), encrypted JSON (conversations), localStorage (settings) |

## Storage Paths

All runtime data is local-only and never leaves your machine:

| Data | Location |
|------|----------|
| Conversations | `%APPDATA%/com.veyra.app/` (AES-GCM encrypted) |
| Memory DB | `%APPDATA%/com.veyra.app/` (SQLite) |
| Settings | Browser localStorage (`veyra.settings.v1`) |
| Characters | SQLite via Tauri |
| Documents | SQLite via Tauri |
| Projects | SQLite via Tauri |
| Research | SQLite via Tauri |
| Email accounts | SQLite via Tauri |

## Feature Modules

| Module | Description |
|--------|-------------|
| [Chat](./01-chat.md) | Core AI chat pipeline with streaming, tool calls, and memory injection |
| [Memory](./02-memory.md) | Local-first memory system with 5 modes and 10 node types |
| [Documents](./03-documents.md) | Markdown document editor with versioning and AI assistance |
| [Characters](./04-characters.md) | Roleplay personas with lorebook, group chat, and CCv3 support |
| [Research](./05-research.md) | 9-phase deep research pipeline with citation auditing |
| [Web Search](./06-web-search.md) | SearXNG/Docker search with ArXiv and Wikipedia support |
| [Projects](./07-projects.md) | Per-project containers for scoping chats, memory, and settings |
| [Email](./08-email.md) | Gmail OAuth and IMAP email client |
| [Agents](./09-agents.md) | Optional Pi CLI integration for plan and build modes |
| [Architecture](./10-architecture.md) | Cross-cutting architecture patterns and system design |

## Running the App

```powershell
# Frontend only (browser preview)
npm run dev

# Desktop app (Tauri + hot reload)
npm run dev:app

# Full stack (Tauri production build)
npm run dev:full

# Production build
npm run build

# Lint and typecheck
npm run lint

# Tests
npm run test
```

## Dependencies

### Core
- `@tauri-apps/api` v2 - Tauri IPC
- `react` / `react-dom` v19 - UI framework
- `zustand` v5 - State management
- `react-markdown` + `remark-gfm` + `rehype-highlight` - Markdown rendering
- `lucide-react` - Icons
- `clsx` + `tailwind-merge` - Class utilities

### Backend (Tauri plugins)
- `@tauri-apps/plugin-dialog` - File dialogs
- `@tauri-apps/plugin-http` - HTTP requests
- `@tauri-apps/plugin-shell` - Shell commands (Pi CLI, Docker)

### Dev
- Vite 8, TypeScript 6, ESLint 10, Vitest 3, Tailwind CSS 4
