# Tech Stack

Veyra is a **local-first AI desktop workspace** built with Tauri v2, React, TypeScript, Vite, and Zustand. It runs AI models locally via LM Studio and keeps all data on your machine.

## Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 (Rust backend) |
| Frontend | React 19, TypeScript, Vite 8 |
| Styling | Tailwind CSS 4 |
| State | Zustand 5 |
| AI provider | LM Studio (local) |
| Persistence | SQLite (via Tauri), encrypted JSON (conversations), localStorage (settings) |

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
