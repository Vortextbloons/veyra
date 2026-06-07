import type { ProviderToolDefinition } from "@/lib/providers/types";

export const WEB_SEARCH_TOOL_NAME = "web_search";
export const DOC_CREATE_TOOL_NAME = "doc_create";
export const DOC_UPDATE_TOOL_NAME = "doc_update";

const DOCUMENT_TYPES = [
  "document",
  "technical_spec",
  "essay",
  "report",
  "proposal",
  "readme",
  "notes",
  "prompt",
  "project_plan",
  "meeting_notes",
  "research_brief",
  "agent_instruction",
] as const;

export function buildProviderTools(options: {
  webSearchEnabled: boolean;
  documentToolsEnabled: boolean;
  activeDocumentId?: string;
}): ProviderToolDefinition[] {
  const tools: ProviderToolDefinition[] = [];

  if (options.webSearchEnabled) {
    tools.push({
      type: "function",
      function: {
        name: WEB_SEARCH_TOOL_NAME,
        description: "Search the web for current information when the answer needs up-to-date facts.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "A focused search query.",
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    });
  }

  if (options.documentToolsEnabled) {
    tools.push({
      type: "function",
      function: {
        name: DOC_CREATE_TOOL_NAME,
        description: "Create a markdown document in Veyra's document editor for long-form content.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Document title." },
            documentType: {
              type: "string",
              enum: DOCUMENT_TYPES,
              description: "Document category.",
            },
            contentMarkdown: {
              type: "string",
              description: "Complete markdown content for the document.",
            },
          },
          required: ["title", "documentType", "contentMarkdown"],
          additionalProperties: false,
        },
      },
    });

    tools.push({
      type: "function",
      function: {
        name: DOC_UPDATE_TOOL_NAME,
        description: options.activeDocumentId
          ? `Update an existing markdown document. The active document id is ${options.activeDocumentId}.`
          : "Update an existing markdown document by id.",
        parameters: {
          type: "object",
          properties: {
            documentId: {
              type: "string",
              description: "Document id to update. Use the active document id when editing the active document.",
            },
            mode: {
              type: "string",
              enum: ["replace_section", "insert_after_section", "replace_all"],
            },
            target: {
              type: "string",
              description: "Section title for replace_section or insert_after_section.",
            },
            contentMarkdown: {
              type: "string",
              description: "Markdown content to insert or use as replacement.",
            },
          },
          required: ["documentId", "mode", "contentMarkdown"],
          additionalProperties: false,
        },
      },
    });
  }

  return tools;
}
