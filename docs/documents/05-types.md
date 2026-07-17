# Document Key Types

From `src/modules/documents/document-types.ts`:

```typescript
type DocumentType =
  | "document" | "technical_spec" | "essay" | "report"
  | "proposal" | "readme" | "notes" | "prompt"
  | "project_plan" | "meeting_notes" | "research_brief"
  | "agent_instruction";

type DocumentStatus = "draft" | "review" | "final" | "archived";

type UpdateMode =
  | "replace_all" | "replace_section"
  | "insert_after_section" | "replace_text";

type ChangeSource = "user" | "assistant" | "system";

interface DocumentRecord {
  id: string;
  projectId?: string;
  conversationId?: string;
  isGlobal: boolean;
  title: string;
  type: DocumentType;
  status: DocumentStatus;
  editorFormat: string;
  contentMarkdown: string;
  tags: string[];
  folderId?: string;
  createdAt: string;
  updatedAt: string;
  lastExportedAt?: string;
}

interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  contentMarkdown: string;
  changeSource: ChangeSource;
  changeSummary: string;
  sourceConversationId?: string;
  sourceMessageId?: string;
  createdAt: string;
}

interface DocumentFolder {
  id: string;
  name: string;
  parentId?: string;
  projectId?: string;
  sortOrder: number;
}
```
