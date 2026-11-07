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
export const CREATE_ARTIFACT_TOOL_NAME = "create_artifact";
export const INLINE_EDIT_TOOL_NAME = "inline_edit";

export function buildProviderTools(options: {
  webSearchEnabled: boolean;
  codeExecutionEnabled: boolean;
  enhancedMode?: boolean;
  interactiveAnswersEnabled?: boolean;
  artifactsEnabled?: boolean;
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
            "Compose an interactive answer: a live, self-contained UI page instead of prose. Use it when the answer is easier to explore than to read — such as adjustable inputs, comparisons, plans, checklists, calculations, step-by-step how-to, or anything with numbers, choices or parts. The program is an openui-lang document written with the component library described in the system prompt: it holds its own state in $variables, computes what it shows with @functions, and reacts to the user without another message. Compose the page for the user's actual content, never a template with placeholder rows. Do not repeat the program in your reply: write one short sentence about the answer and call this tool.",
          parameters: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Optional short heading for the block, under 80 characters. Omit it when the program's own Title already says it.",
              },
              program: {
                type: "string",
                description: "The complete openui-lang program. Must start with `root = Col(...)`, one statement per line, no markdown fences and no prose.",
              },
            },
            required: ["program"],
            additionalProperties: false,
          },
        },
      });
    }
  }

  if (options.artifactsEnabled) {
    tools.push({
      type: "function",
      function: {
        name: CREATE_ARTIFACT_TOOL_NAME,
        description:
          "Create one finished, self-contained deliverable attached to this reply. Use an artifact only when the user asks you to create a reusable deliverable, requests a visual output, or a visual materially clarifies the requested result. Keep ordinary explanations and advice in chat. Formats: html for visual pages, diagrams, infographics, roadmaps, print-friendly reports, or mockups; document for editable Markdown deliverables; code for a downloadable source/configuration file. HTML must use inline CSS/SVG and optional inline JavaScript only, with no remote dependencies or fabricated data. Code is a downloadable file and is never run by this tool. Return one artifact at most per assistant reply.",
        parameters: {
          type: "object",
          properties: {
            format: { type: "string", enum: ["html", "code", "document"] },
            title: { type: "string", description: "Short display title." },
            content: { type: "string", description: "Complete artifact source. Documents use Markdown." },
            language: { type: "string", description: "Optional language for code files, such as json, sql, yaml, python, or rust." },
            filename: { type: "string", description: "Optional single output filename, such as Dockerfile or package.json." },
          },
          required: ["format", "title", "content"],
          additionalProperties: false,
        },
      },
    });
  }

  return tools;
}
