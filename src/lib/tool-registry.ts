import type { ProviderToolDefinition } from "@/lib/providers/types";
import { STUDIO_RENDER_TOOL } from "@/modules/chat/studio/studio-tool";
export { STUDIO_RENDER_TOOL_NAME } from "@/modules/chat/studio/studio-tool";

export const WEB_SEARCH_TOOL_NAME = "web_search";
export const DOC_CREATE_TOOL_NAME = "doc_create";
export const DOC_READ_TOOL_NAME = "doc_read";
export const DOC_UPDATE_TOOL_NAME = "doc_update";
export const CODE_EXEC_TOOL_NAME = "code_execution";
export const SCRATCHPAD_TOOL_NAME = "scratchpad_write";
export const ASK_QUESTION_TOOL_NAME = "ask_question";
export const INLINE_EDIT_TOOL_NAME = "inline_edit";

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
  codeExecutionEnabled: boolean;
  activeDocumentId?: string;
  enhancedMode?: boolean;
  studioEnabled?: boolean;
}): ProviderToolDefinition[] {
  const tools: ProviderToolDefinition[] = [];
  if (options.studioEnabled) tools.push(STUDIO_RENDER_TOOL);

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
            intent: {
              type: "string",
              enum: ["general", "news", "academic", "code", "documentation", "local", "discussion"],
              description: "Search intent used to route to suitable SearXNG categories and engines.",
            },
            timeRange: {
              type: "string",
              enum: ["day", "week", "month", "year"],
              description: "Optional freshness window. Use only when recency matters.",
            },
            language: {
              type: "string",
              description: "Optional SearXNG locale such as en-US.",
            },
            safeSearch: {
              type: "integer",
              enum: [0, 1, 2],
              description: "SafeSearch level: 0 off, 1 moderate, 2 strict.",
            },
            page: {
              type: "integer",
              minimum: 1,
              maximum: 20,
              description: "Results page, normally 1.",
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    });
  }

  if (options.codeExecutionEnabled) {
    tools.push({
      type: "function",
      function: {
        name: CODE_EXEC_TOOL_NAME,
        description:
          "Run a local Python snippet for calculations, text processing, and read-only inspection of files in the current workspace. Dangerous imports and write helpers are blocked.",
        parameters: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "A Python 3 snippet to execute locally.",
            },
          },
          required: ["code"],
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
        description: "Create a markdown document in Veyra's document editor for long-form content. The result returns the new document id; use that exact id for later reads or edits and do not use a placeholder such as 'active'.",
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
        name: DOC_READ_TOOL_NAME,
        description: options.activeDocumentId
          ? `Read an existing markdown document so you can answer questions about it or edit it accurately. The active document id is ${options.activeDocumentId}.`
          : "Read an existing markdown document by id so you can answer questions about it or edit it accurately.",
        parameters: {
          type: "object",
          properties: {
            documentId: {
              type: "string",
              description: "Exact document id to read. Use the id returned by doc_create; do not use a title or the word 'active'.",
            },
          },
          required: ["documentId"],
          additionalProperties: false,
        },
      },
    });

    tools.push({
      type: "function",
      function: {
        name: INLINE_EDIT_TOOL_NAME,
        description: options.activeDocumentId
          ? `Edit an existing document. Use replace_text for targeted text replacements, replace_section or insert_after_section for section edits, and replace_all for full rewrites. The active document id is ${options.activeDocumentId}.`
          : "Edit an existing document by id. Use replace_text for targeted text replacements, replace_section or insert_after_section for section edits, and replace_all for full rewrites.",
        parameters: {
          type: "object",
          properties: {
            documentId: {
              type: "string",
              description: "Exact document id to edit. Use the id returned by doc_create; do not use a title or the word 'active'.",
            },
            mode: {
              type: "string",
              enum: ["replace_text", "replace_all", "replace_section", "insert_after_section"],
              description: "replace_text for exact text match, replace_section to replace a heading section, insert_after_section to append after a section, replace_all to rewrite the full document.",
            },
            target: {
              type: "string",
              description: "Section heading for replace_section/insert_after_section. Exact text to replace for replace_text.",
            },
            contentMarkdown: {
              type: "string",
              description: "Markdown content to insert or use as replacement.",
            },
            explanation: {
              type: "string",
              description: "Brief explanation of what changed and why.",
            },
          },
          required: ["documentId", "mode", "contentMarkdown"],
          additionalProperties: false,
        },
      },
    });
  }

  if (options.enhancedMode) {
    tools.push({
      type: "function",
      function: {
        name: SCRATCHPAD_TOOL_NAME,
        description:
          "Write notes, findings, or intermediate results to a working scratchpad. Use this to keep track of information across multiple tool rounds. Notes are visible to you but hidden from the user unless expanded.",
        parameters: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "Content to write to the scratchpad. Appends to existing notes.",
            },
          },
          required: ["content"],
          additionalProperties: false,
        },
      },
    });

    tools.push({
      type: "function",
      function: {
        name: ASK_QUESTION_TOOL_NAME,
        description:
          "Pause and ask the user one or more questions for clarification before proceeding. Use when you are uncertain about intent, need to choose between approaches, or require missing information. You may ask multiple questions in a single call — the user answers all before you continue.",
        parameters: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: {
                    type: "string",
                    description: "The question to ask.",
                  },
                  options: {
                    type: "array",
                    items: { type: "string" },
                    description:
                      "Optional multiple-choice options. If provided, the user picks one. If omitted, the user types a free-text answer.",
                  },
                },
                required: ["text"],
              },
              description:
                "Array of questions to ask. Each can be multiple-choice (with options) or free-text (without options).",
            },
          },
          required: ["questions"],
          additionalProperties: false,
        },
      },
    });
  }

  return tools;
}
