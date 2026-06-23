import type { ProviderToolDefinition } from "@/lib/providers/types";

export const WEB_SEARCH_TOOL_NAME = "web_search";
export const DOC_CREATE_TOOL_NAME = "doc_create";
export const DOC_READ_TOOL_NAME = "doc_read";
export const DOC_UPDATE_TOOL_NAME = "doc_update";
export const CODE_EXEC_TOOL_NAME = "code_execution";
export const SCRATCHPAD_TOOL_NAME = "scratchpad_write";
export const ASK_QUESTION_TOOL_NAME = "ask_question";

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
              enum: ["replace_section", "insert_after_section", "replace_all", "replace_text"],
            },
            target: {
              type: "string",
              description: "Section title for replace_section or insert_after_section. Exact text to replace for replace_text.",
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
              description: "Document id to read. Use the active document id when reading the active document.",
            },
          },
          required: ["documentId"],
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
