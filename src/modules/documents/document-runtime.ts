import type { DocCreateIntent, DocUpdateIntent, DocumentType } from "./document-types";
import { useDocumentStore } from "./document-store";
import { generateTemplateMarkdown } from "./document-templates";
import { replaceMarkdownSection, insertAfterSection } from "./document-markdown";

export type DocumentOperationResult = {
  applied: boolean;
  sanitizedText: string;
};

function stripDocJsonBlocks(assistantText: string): string {
  let stripped = assistantText.replace(/```json\s*\n[\s\S]*?"type"\s*:\s*"doc\.(?:create|update)"[\s\S]*?\n```/g, "").trim();
  stripped = stripped.replace(/\{\s*"type"\s*:\s*"doc\.(?:create|update)"[\s\S]*?\}/g, "").trim();
  return stripped.replace(/\n{3,}/g, "\n\n").trim();
}

export function detectDocCreateIntent(assistantText: string): DocCreateIntent | null {
  const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/g;
  let match;

  while ((match = jsonBlockRegex.exec(assistantText)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      if (json.type === "doc.create" && json.title && json.documentType) {
        return {
          type: "doc.create",
          title: json.title,
          documentType: json.documentType as DocumentType,
          contentMarkdown: json.contentMarkdown || generateTemplateMarkdown(json.documentType, json.title),
        };
      }
    } catch {
      // Not valid JSON, continue searching
    }
  }

  const inlineJsonRegex = /\{\s*"type"\s*:\s*"doc\.create"[\s\S]*?\}/;
  const inlineMatch = assistantText.match(inlineJsonRegex);
  if (inlineMatch) {
    try {
      const json = JSON.parse(inlineMatch[0]);
      if (json.type === "doc.create" && json.title && json.documentType) {
        return {
          type: "doc.create",
          title: json.title,
          documentType: json.documentType as DocumentType,
          contentMarkdown: json.contentMarkdown || generateTemplateMarkdown(json.documentType, json.title),
        };
      }
    } catch {
      // Not valid JSON
    }
  }

  return null;
}

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
    return { applied: false, sanitizedText: "" };
  }
}

export function detectDocUpdateIntent(assistantText: string): DocUpdateIntent | null {
  const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/g;
  let match;

  while ((match = jsonBlockRegex.exec(assistantText)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      if (
        json.type === "doc.update" &&
        json.documentId &&
        json.mode &&
        json.contentMarkdown
      ) {
        return {
          type: "doc.update",
          documentId: json.documentId,
          mode: json.mode,
          target: json.target,
          contentMarkdown: json.contentMarkdown,
        };
      }
    } catch {
      // Not valid JSON, continue searching
    }
  }

  const inlineJsonRegex = /\{\s*"type"\s*:\s*"doc\.update"[\s\S]*?\}/;
  const inlineMatch = assistantText.match(inlineJsonRegex);
  if (inlineMatch) {
    try {
      const json = JSON.parse(inlineMatch[0]);
      if (
        json.type === "doc.update" &&
        json.documentId &&
        json.mode &&
        json.contentMarkdown
      ) {
        return {
          type: "doc.update",
          documentId: json.documentId,
          mode: json.mode,
          target: json.target,
          contentMarkdown: json.contentMarkdown,
        };
      }
    } catch {
      // Not valid JSON
    }
  }

  return null;
}

export async function executeDocUpdate(
  intent: DocUpdateIntent,
  conversationId?: string
): Promise<DocumentOperationResult> {
  const store = useDocumentStore.getState();
  const doc = store.documents.find((d) => d.id === intent.documentId);

  if (!doc) {
    console.error(`[Document] Document not found: ${intent.documentId}`);
    return { applied: false, sanitizedText: "" };
  }

  if (intent.mode === "replace_all") {
    console.warn("[Document] Whole-document replacement requires an explicit preview/apply flow.");
    return {
      applied: false,
      sanitizedText: `I prepared a whole-document rewrite for "${doc.title}", but it was not applied because full replacements require review first.`,
    };
  }

  try {
    let newContent: string;

    switch (intent.mode) {
      case "replace_section":
        if (!intent.target) {
          console.error("[Document] replace_section requires target");
          return { applied: false, sanitizedText: "" };
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
          return { applied: false, sanitizedText: "" };
        }
        newContent = insertAfterSection(
          doc.contentMarkdown,
          intent.target,
          intent.contentMarkdown
        );
        break;

      default:
        console.error(`[Document] Unknown update mode: ${intent.mode}`);
        return { applied: false, sanitizedText: "" };
    }

    if (newContent === doc.contentMarkdown) {
      return {
        applied: false,
        sanitizedText: intent.target
          ? `I could not find the "${intent.target}" section in "${doc.title}", so no document changes were applied.`
          : `No document changes were applied to "${doc.title}".`,
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
    return { applied: false, sanitizedText: "" };
  }
}

export async function handleDocumentOperations(
  assistantText: string,
  conversationId: string
): Promise<DocumentOperationResult | null> {
  const createIntent = detectDocCreateIntent(assistantText);
  if (createIntent) {
    const result = await executeDocCreation(createIntent, conversationId);
    return {
      ...result,
      sanitizedText: stripDocJsonBlocks(assistantText) || result.sanitizedText,
    };
  }

  const updateIntent = detectDocUpdateIntent(assistantText);
  if (updateIntent) {
    const result = await executeDocUpdate(updateIntent, conversationId);
    return {
      ...result,
      sanitizedText: stripDocJsonBlocks(assistantText) || result.sanitizedText,
    };
  }

  return null;
}
