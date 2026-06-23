# Documents Module

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

## How It Works

### Storage
Documents are stored in SQLite via Tauri IPC. Each document has:
- `id`, `title`, `content`, `type`, `status`
- `conversationId` or `projectId` for scoping
- `versionCount` for version history
- `createdAt`, `updatedAt` timestamps

### Active Document Draft
- The active document maintains an in-memory draft to avoid remapping on every keystroke
- Draft content is separate from the persisted version

### Auto-Save
- Debounced save (configurable delay) avoids excessive writes
- Each save creates a version snapshot
- Version snapshots track change source: `user`, `assistant`, or `system`

### AI Integration
Documents are accessible via 3 chat tools:

#### `doc_read`
```json
{
  "documentId": "string",
  "includeVersions": false
}
```

#### `doc_create`
```json
{
  "title": "string",
  "content": "string",
  "type": "document",
  "conversationId": "optional",
  "projectId": "optional"
}
```

#### `doc_update`
```json
{
  "documentId": "string",
  "updateMode": "replace_all | replace_section | insert_after_section | replace_text",
  "targetSection": "optional heading text",
  "newContent": "string"
}
```

### Update Modes
| Mode | Description |
|------|-------------|
| `replace_all` | Replace entire document content |
| `replace_section` | Replace a section by heading |
| `insert_after_section` | Insert content after a section |
| `replace_text` | Replace specific text |

### Version History
- Pre/post version snapshots are created for each AI mutation
- Enables undo capability for AI edits
- Version count is tracked on the document record

### Export
- Export to **Markdown** (.md) or **Plain Text** (.txt)
- Uses Tauri save dialog for file location selection

### Auto-Sync
- Documents sync with the active conversation context
- Documents sync with the active project context
- When switching conversations/projects, the document list updates accordingly

## Key Types

```typescript
interface DocumentRecord {
  id: string
  title: string
  content: string
  type: DocumentType
  status: DocumentStatus
  conversationId?: string
  projectId?: string
  versionCount: number
  createdAt: number
  updatedAt: number
}

interface DocumentVersion {
  id: string
  documentId: string
  content: string
  changeSource: 'user' | 'assistant' | 'system'
  createdAt: number
}
```
