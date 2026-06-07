import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { newId, nowIso } from "@/lib/id";
import type {
  DocumentRecord,
  DocumentVersion,
  CreateDocumentInput,
  UpdateDocumentInput,
  CreateVersionInput,
} from "@/modules/documents/document-types";

export async function listDocuments(projectId?: string, conversationId?: string): Promise<DocumentRecord[]> {
  return invoke<DocumentRecord[]>("list_documents", { projectId: projectId ?? null, conversationId: conversationId ?? null });
}

export async function getDocument(id: string): Promise<DocumentRecord> {
  return invoke<DocumentRecord>("get_document", { id });
}

export async function createDocument(
  input: Omit<CreateDocumentInput, "id"> & { id?: string },
): Promise<DocumentRecord> {
  const now = nowIso();
  const id = input.id ?? newId("doc");
  const payload = {
    id,
    projectId: input.projectId ?? null,
    conversationId: input.conversationId ?? null,
    isGlobal: input.isGlobal ?? false,
    title: input.title,
    type: input.type,
    status: "draft",
    editorFormat: "markdown",
    contentMarkdown: input.contentMarkdown ?? "",
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
    lastExportedAt: null,
  };
  return invoke<DocumentRecord>("create_document", { input: JSON.stringify(payload) });
}

export async function updateDocument(input: UpdateDocumentInput): Promise<DocumentRecord> {
  const payload = { ...input, updatedAt: nowIso() };
  return invoke<DocumentRecord>("update_document", { input: JSON.stringify(payload) });
}

export async function deleteDocument(id: string): Promise<void> {
  await invoke<void>("delete_document", { id });
}

export async function createDocumentVersion(
  input: Omit<CreateVersionInput, "id"> & { id?: string },
): Promise<DocumentVersion> {
  const now = nowIso();
  const id = input.id ?? newId("doc");
  const payload = {
    id,
    documentId: input.documentId,
    versionNumber: 0,
    contentMarkdown: input.contentMarkdown,
    changeSource: input.changeSource,
    changeSummary: input.changeSummary ?? "",
    sourceConversationId: input.sourceConversationId ?? null,
    sourceMessageId: input.sourceMessageId ?? null,
    createdAt: now,
  };
  return invoke<DocumentVersion>("create_document_version", { input: JSON.stringify(payload) });
}

export async function listDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  return invoke<DocumentVersion[]>("list_document_versions", { documentId });
}

export async function getDocumentVersion(id: string): Promise<DocumentVersion> {
  return invoke<DocumentVersion>("get_document_version", { id });
}

export async function restoreDocumentVersion(versionId: string): Promise<DocumentRecord> {
  return invoke<DocumentRecord>("restore_document_version", { versionId });
}

export async function exportDocumentMarkdown(documentId: string, defaultName: string): Promise<string | null> {
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (!path) return null;
  await invoke("export_document_markdown", { documentId, targetPath: path });
  return path;
}

export async function exportDocumentTxt(documentId: string, defaultName: string): Promise<string | null> {
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: "Text", extensions: ["txt"] }],
  });
  if (!path) return null;
  await invoke("export_document_txt", { documentId, targetPath: path });
  return path;
}
