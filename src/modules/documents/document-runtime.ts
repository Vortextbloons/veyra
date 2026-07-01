import type { DocCreateIntent, DocReadIntent, DocUpdateIntent, InlineEditIntent } from "./document-types";
import { selectActiveDocumentContent, useDocumentStore } from "./document-store";
import { replaceMarkdownSection, insertAfterSection } from "./document-markdown";
import { getDocument } from "@/lib/document-storage";
import { useProjectStore } from "@/modules/projects/project-store";

export type DocumentOperationResult = {
  applied: boolean;
  sanitizedText: string;
  error?: string;
};

export type DocumentReadResult = DocumentOperationResult & {
  documentContent?: string;
};

export async function executeDocRead(
  intent: DocReadIntent,
): Promise<DocumentReadResult> {
  const store = useDocumentStore.getState();
  let doc = store.documents.find((d) => d.id === intent.documentId);

  try {
    if (!doc) {
      doc = await getDocument(intent.documentId);
    }

    const content =
      store.activeDocumentId === intent.documentId
        ? selectActiveDocumentContent(store) || doc.contentMarkdown
        : doc.contentMarkdown;

    return {
      applied: true,
      sanitizedText: `Read "${doc.title}" from the document editor.`,
      documentContent: `# ${doc.title}\n\nDocument id: ${doc.id}\nType: ${doc.type}\nUpdated: ${doc.updatedAt}\n\n${content}`,
    };
  } catch (error) {
    console.error("[Document] Failed to read document:", error);
    return {
      applied: false,
      sanitizedText: `Document read failed: ${error instanceof Error ? error.message : String(error)}`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function executeDocCreation(
  intent: DocCreateIntent,
  conversationId?: string
): Promise<DocumentOperationResult> {
  try {
    const activeProjectId = useProjectStore.getState().activeProjectId ?? undefined;
    const doc = await useDocumentStore.getState().createDocument({
      title: intent.title,
      type: intent.documentType,
      contentMarkdown: intent.contentMarkdown,
      conversationId,
      projectId: activeProjectId,
    });

    await useDocumentStore.getState().createVersionSnapshot({
      documentId: doc.id,
      contentMarkdown: doc.contentMarkdown,
      changeSource: "assistant",
      changeSummary: "Initial document creation",
      sourceConversationId: conversationId,
    });

    return {
      applied: true,
      sanitizedText: `Created document "${doc.title}" in the document editor.`,
    };
  } catch (error) {
    console.error("[Document] Failed to create document:", error);
    return {
      applied: false,
      sanitizedText: `Document creation failed: ${error instanceof Error ? error.message : String(error)}`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function executeDocUpdate(
  intent: DocUpdateIntent,
  conversationId?: string
): Promise<DocumentOperationResult> {
  const store = useDocumentStore.getState();
  let doc = store.documents.find((d) => d.id === intent.documentId);

  if (!doc) {
    try {
      doc = await getDocument(intent.documentId);
    } catch {
      console.error(`[Document] Document not found: ${intent.documentId}`);
      return {
        applied: false,
        sanitizedText: `Document update failed: document not found (${intent.documentId}).`,
        error: `Document not found: ${intent.documentId}`,
      };
    }
  }

  const currentContent =
    store.activeDocumentId === doc.id ? selectActiveDocumentContent(store) : doc.contentMarkdown;

  try {
    let newContent: string;

    switch (intent.mode) {
      case "replace_all":
        newContent = intent.contentMarkdown;
        break;

      case "replace_section":
        if (!intent.target) {
          console.error("[Document] replace_section requires target");
          return {
            applied: false,
            sanitizedText: "Document update failed: replace_section requires target.",
            error: "replace_section requires target",
          };
        }
        newContent = replaceMarkdownSection(
          currentContent,
          intent.target,
          intent.contentMarkdown
        );
        break;

      case "insert_after_section":
        if (!intent.target) {
          console.error("[Document] insert_after_section requires target");
          return {
            applied: false,
            sanitizedText: "Document update failed: insert_after_section requires target.",
            error: "insert_after_section requires target",
          };
        }
        newContent = insertAfterSection(
          currentContent,
          intent.target,
          intent.contentMarkdown
        );
        break;

      case "replace_text":
        if (!intent.target) {
          console.error("[Document] replace_text requires target");
          return {
            applied: false,
            sanitizedText: "Document update failed: replace_text requires target.",
            error: "replace_text requires target",
          };
        }
        if (!currentContent.includes(intent.target)) {
          return {
            applied: false,
            sanitizedText: `I could not find the selected text in "${doc.title}", so no document changes were applied.`,
            error: "Selected text not found",
          };
        }
        newContent = currentContent.replace(intent.target, intent.contentMarkdown);
        break;

      default:
        console.error(`[Document] Unknown update mode: ${intent.mode}`);
        return {
          applied: false,
          sanitizedText: `Document update failed: unknown mode ${intent.mode}.`,
          error: `Unknown update mode: ${intent.mode}`,
        };
    }

    if (newContent === currentContent) {
      return {
        applied: false,
        sanitizedText: intent.target
          ? `I could not find the "${intent.target}" section in "${doc.title}", so no document changes were applied.`
          : `No document changes were applied to "${doc.title}".`,
        error: intent.target
          ? `Section not found: ${intent.target}`
          : "No document changes were applied",
      };
    }

    await store.createVersionSnapshot({
      documentId: doc.id,
      contentMarkdown: currentContent,
      changeSource: "assistant",
      changeSummary: `Before ${intent.mode} update`,
      sourceConversationId: conversationId,
    });

    await store.updateDocument({
      id: doc.id,
      contentMarkdown: newContent,
    });

    await store.createVersionSnapshot({
      documentId: doc.id,
      contentMarkdown: newContent,
      changeSource: "assistant",
      changeSummary: `${intent.mode} update${intent.target ? `: ${intent.target}` : ""}`,
      sourceConversationId: conversationId,
    });

    return {
      applied: true,
      sanitizedText: `Updated "${doc.title}" in the document editor.`,
    };
  } catch (error) {
    console.error("[Document] Failed to update document:", error);
    return {
      applied: false,
      sanitizedText: `Document update failed: ${error instanceof Error ? error.message : String(error)}`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ---------------------------------------------------------------------------
// Inline edit (applies edit to document)
// ---------------------------------------------------------------------------

export type InlineEditResult = {
  applied: boolean;
  sanitizedText: string;
  error?: string;
};

export async function executeInlineEdit(
  intent: InlineEditIntent,
  conversationId?: string,
): Promise<InlineEditResult> {
  const store = useDocumentStore.getState();
  let doc = store.documents.find((d) => d.id === intent.documentId);

  if (!doc) {
    try {
      doc = await getDocument(intent.documentId);
    } catch {
      return {
        applied: false,
        sanitizedText: `Inline edit failed: document not found (${intent.documentId}).`,
        error: `Document not found: ${intent.documentId}`,
      };
    }
  }

  const currentContent =
    store.activeDocumentId === doc.id ? selectActiveDocumentContent(store) : doc.contentMarkdown;

  try {
    let newContent: string;

    switch (intent.mode) {
      case "replace_all":
        newContent = intent.contentMarkdown;
        break;

      case "replace_text":
        if (!intent.target) {
          return {
            applied: false,
            sanitizedText: "Inline edit failed: replace_text requires target.",
            error: "replace_text requires target",
          };
        }
        if (!currentContent.includes(intent.target)) {
          return {
            applied: false,
            sanitizedText: `I could not find the specified text in "${doc.title}", so no edit was applied.`,
            error: "Selected text not found",
          };
        }
        newContent = currentContent.replace(intent.target, intent.contentMarkdown);
        break;

      case "replace_section":
        if (!intent.target) {
          return {
            applied: false,
            sanitizedText: "Inline edit failed: replace_section requires target (section heading).",
            error: "replace_section requires target",
          };
        }
        newContent = replaceMarkdownSection(currentContent, intent.target, intent.contentMarkdown);
        break;

      case "insert_after_section":
        if (!intent.target) {
          return {
            applied: false,
            sanitizedText: "Inline edit failed: insert_after_section requires target (section heading).",
            error: "insert_after_section requires target",
          };
        }
        newContent = insertAfterSection(currentContent, intent.target, intent.contentMarkdown);
        break;

      default:
        return {
          applied: false,
          sanitizedText: `Inline edit failed: unknown mode ${intent.mode}.`,
          error: `Unknown mode: ${intent.mode}`,
        };
    }

    if (newContent === currentContent) {
      return {
        applied: false,
        sanitizedText: `No changes applied to "${doc.title}".`,
        error: "No changes",
      };
    }

    await store.createVersionSnapshot({
      documentId: doc.id,
      contentMarkdown: currentContent,
      changeSource: "assistant",
      changeSummary: `Before inline edit: ${intent.explanation ?? intent.mode}`,
      sourceConversationId: conversationId,
    });

    await store.updateDocument({
      id: doc.id,
      contentMarkdown: newContent,
    });

    await store.createVersionSnapshot({
      documentId: doc.id,
      contentMarkdown: newContent,
      changeSource: "assistant",
      changeSummary: `Inline edit: ${intent.explanation ?? intent.mode}${intent.target ? ` (${intent.target.slice(0, 40)})` : ""}`,
      sourceConversationId: conversationId,
    });

    return {
      applied: true,
      sanitizedText: `Updated "${doc.title}" in the document editor.`,
    };
  } catch (error) {
    return {
      applied: false,
      sanitizedText: `Inline edit failed: ${error instanceof Error ? error.message : String(error)}`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
