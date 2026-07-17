# Documents Overview

Markdown document editor with versioning, AI-assisted creation/update, and export. Documents can be scoped to conversations, projects, or be global.

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/documents/document-types.ts` | Type definitions |
| `src/modules/documents/document-store.ts` | Zustand store with auto-save and versioning |
| `src/modules/documents/document-runtime.ts` | AI document operations |
| `src/modules/documents/document-markdown.ts` | Markdown section manipulation |
| `src/modules/documents/document-export.ts` | Export to markdown/txt |

## Document Types

| Type | Description |
|------|-------------|
| `document` | General document |
| `technical_spec` | Technical specification |
| `essay` | Essay or article |
| `report` | Report with structure |
| `proposal` | Project proposal |
| `readme` | Readme file |
| `notes` | Quick notes |
| `prompt` | AI prompt template |
| `project_plan` | Project planning doc |
| `meeting_notes` | Meeting notes |
| `research_brief` | Research summary |
| `agent_instruction` | Agent instruction set |

## Document Statuses

| Status | Description |
|--------|-------------|
| `draft` | Work in progress |
| `review` | Under review |
| `final` | Completed |
| `archived` | No longer active |

## Storage

Documents are stored in SQLite via Tauri IPC. Each document has:
- `id`, `title`, `content`, `type`, `status`
- `conversationId` or `projectId` for scoping
- `versionCount` for version history
- `createdAt`, `updatedAt` timestamps

## Auto-Sync

- Documents sync with the active conversation context
- Documents sync with the active project context
- When switching conversations/projects, the document list updates accordingly
