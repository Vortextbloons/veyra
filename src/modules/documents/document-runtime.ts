import type { DocCreateIntent, DocUpdateIntent } from "./document-types";
import { useDocumentStore } from "./document-store";
import { replaceMarkdownSection, insertAfterSection } from "./document-markdown";

export type DocumentOperationResult = {
  applied: boolean;
  sanitizedText: string;
  error?: string;
};

export async function executeDocCreation(
  intent: DocCreateIntent,
  conversationId?: string
): Promise<DocumentOperationResult> {
  try {
    const doc = await useDocumentStore.getState().createDocument({
      title: intent.title,
      type: intent.documentType,
      contentMarkdown: intent.contentMarkdown,
      conversationId,
    });

    await useDocumentStore.getState().createVersionSnapshot({
      documentId: doc.id,
      contentMarkdown: doc.contentMarkdown,
      changeSource: "assistant",
      changeSummary: "Initial document creation",
      sourceConversationId: conversationId,
    });

    console.log(`[Document] Created: ${doc.title} (${doc.id})`);
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
  const doc = store.documents.find((d) => d.id === intent.documentId);

  if (!doc) {
    console.error(`[Document] Document not found: ${intent.documentId}`);
    return {
      applied: false,
      sanitizedText: `Document update failed: document not found (${intent.documentId}).`,
      error: `Document not found: ${intent.documentId}`,
    };
  }

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
          doc.contentMarkdown,
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
          doc.contentMarkdown,
          intent.target,
          intent.contentMarkdown
        );
        break;

      default:
        console.error(`[Document] Unknown update mode: ${intent.mode}`);
        return {
          applied: false,
          sanitizedText: `Document update failed: unknown mode ${intent.mode}.`,
          error: `Unknown update mode: ${intent.mode}`,
        };
    }

    if (newContent === doc.contentMarkdown) {
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
      contentMarkdown: doc.contentMarkdown,
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

    console.log(`[Document] Updated: ${doc.title} (${intent.mode})`);
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
