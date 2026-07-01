// Document editor type definitions

export type DocumentType =
  | "document"
  | "technical_spec"
  | "essay"
  | "report"
  | "proposal"
  | "readme"
  | "notes"
  | "prompt"
  | "project_plan"
  | "meeting_notes"
  | "research_brief"
  | "agent_instruction";

export type DocumentStatus = "draft" | "review" | "final" | "archived";

export type EditorFormat = "markdown";

export type ChangeSource = "user" | "assistant" | "system";

export interface DocumentRecord {
  id: string;
  projectId?: string;
  conversationId?: string;
  isGlobal: boolean;
  title: string;
  type: DocumentType;
  status: DocumentStatus;
  editorFormat: EditorFormat;
  contentMarkdown: string;
  tags: string[];
  folderId?: string;
  createdAt: string;
  updatedAt: string;
  lastExportedAt?: string;
}

// Folder types for document organization
export interface DocumentFolder {
  id: string;
  name: string;
  parentId?: string;
  projectId?: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFolderInput {
  name: string;
  parentId?: string;
  projectId?: string;
}

export interface UpdateFolderInput {
  id: string;
  name?: string;
  parentId?: string | null;
  position?: number;
}

export interface DocumentVersion {
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

// Helper types for document operations
export interface CreateDocumentInput {
  title: string;
  type: DocumentType;
  contentMarkdown?: string;
  projectId?: string;
  conversationId?: string;
  isGlobal?: boolean;
  tags?: string[];
  folderId?: string;
}

export interface UpdateDocumentInput {
  id: string;
  title?: string;
  type?: DocumentType;
  status?: DocumentStatus;
  contentMarkdown?: string;
  isGlobal?: boolean;
  tags?: string[];
  folderId?: string | null;
  lastExportedAt?: string;
}

export interface CreateVersionInput {
  documentId: string;
  contentMarkdown: string;
  changeSource: ChangeSource;
  changeSummary?: string;
  sourceConversationId?: string;
  sourceMessageId?: string;
}

// AI document operation intents (parsed from assistant responses)
export interface DocCreateIntent {
  type: "doc.create";
  title: string;
  documentType: DocumentType;
  contentMarkdown: string;
}

export interface DocUpdateIntent {
  type: "doc.update";
  documentId: string;
  mode: "replace_all" | "replace_section" | "insert_after_section" | "replace_text";
  target?: string; // section title for section operations, exact text for replace_text
  contentMarkdown: string;
}

export interface DocReadIntent {
  type: "doc.read";
  documentId: string;
}

export interface InlineEditIntent {
  type: "inline.edit";
  documentId: string;
  mode: "replace_text" | "replace_all" | "replace_section" | "insert_after_section";
  target?: string;
  contentMarkdown: string;
  explanation?: string;
}
