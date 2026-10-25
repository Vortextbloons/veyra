import type { ProviderToolDefinition } from "@/lib/providers/types";

export const WEB_SEARCH_TOOL_NAME = "web_search";
// Deprecated document tool names. No longer registered; kept so stale
// references resolve while document removal lands across the codebase.
export const DOC_CREATE_TOOL_NAME = "doc_create";
export const DOC_READ_TOOL_NAME = "doc_read";
export const DOC_UPDATE_TOOL_NAME = "doc_update";
export const CODE_EXEC_TOOL_NAME = "code_execution";
export const SCRATCHPAD_TOOL_NAME = "scratchpad_write";
export const ASK_QUESTION_TOOL_NAME = "ask_question";
export const INTERACTIVE_ANSWER_TOOL_NAME = "generate_interactive_answer";
export const INLINE_EDIT_TOOL_NAME = "inline_edit";

export function buildProviderTools(options: {
  webSearchEnabled: boolean;
  codeExecutionEnabled: boolean;
  enhancedMode?: boolean;
  interactiveAnswersEnabled?: boolean;
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
            intent: {
              type: "string",
              enum: ["general", "news", "academic", "code", "documentation", "local", "discussion"],
              description:
                "Search intent. Adds focused verticals: code repositories, papers, news, or encyclopedia results.",
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

    if (options.interactiveAnswersEnabled) {
      tools.push({
        type: "function",
        function: {
          name: INTERACTIVE_ANSWER_TOOL_NAME,
          description:
            "Create an interactive answer inside the chat when it helps the user understand, compare, or explore something. Choose one kind: chart, comparison, calculator, or steps. Use plain text for simple answers. The rendered controls are local and cannot run arbitrary code or access files.",
          parameters: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: ["chart", "comparison", "calculator", "steps"],
                description: "The visual form that best fits the user's task.",
              },
              title: {
                type: "string",
                description: "Short title for the interactive answer.",
              },
              summary: {
                type: "string",
                description: "Optional one-sentence context shown above the interaction.",
              },
              chartType: {
                type: "string",
                enum: ["bar", "line"],
                description: "Required for charts.",
              },
              labels: {
                type: "array",
                items: { type: "string" },
                description: "Chart category labels, 2–12 items.",
              },
              series: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    values: { type: "array", items: { type: "number" } },
                  },
                  required: ["name", "values"],
                  additionalProperties: false,
                },
                description: "One to four chart series, each with one value per label.",
              },
              yAxisLabel: {
                type: "string",
                description: "Optional chart value label.",
              },
              columns: {
                type: "array",
                items: { type: "string" },
                description: "Comparison headings, 2–6 items.",
              },
              rows: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    values: { type: "array", items: { type: "string" } },
                  },
                  required: ["label", "values"],
                  additionalProperties: false,
                },
                description: "Comparison rows, with one text value per heading.",
              },
              inputs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    label: { type: "string" },
                    value: { type: "number" },
                    min: { type: "number" },
                    max: { type: "number" },
                    step: { type: "number" },
                    suffix: { type: "string" },
                  },
                  required: ["id", "label", "value", "min", "max", "step"],
                  additionalProperties: false,
                },
                description: "Calculator sliders. Use each input id as a variable in formula.",
              },
              formula: {
                type: "string",
                description: "Calculator arithmetic using input ids, numbers, parentheses, +, -, *, /, and ^.",
              },
              resultLabel: {
                type: "string",
                description: "Short label for the live calculator result.",
              },
              resultSuffix: {
                type: "string",
                description: "Optional unit shown after the calculator result.",
              },
              steps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                  },
                  required: ["title", "description"],
                  additionalProperties: false,
                },
                description: "Two to twelve selectable steps in an explanation or process.",
              },
            },
            required: ["kind", "title"],
            additionalProperties: false,
          },
        },
      });
    }
  }

  return tools;
}
