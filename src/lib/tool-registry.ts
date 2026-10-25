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

    if (options.enhancedMode && options.interactiveAnswersEnabled) {
      const answerVariantRequirements: Array<{ kind: string; required: string[] }> = [
        { kind: "text", required: ["body"] },
        { kind: "chart", required: ["chartType", "labels", "series"] },
        { kind: "comparison", required: ["columns", "rows"] },
        { kind: "calculator", required: ["inputs", "formula", "resultLabel"] },
        { kind: "calculator", required: ["inputs", "outputs"] },
        { kind: "steps", required: ["steps"] },
        { kind: "diagram", required: ["nodes", "edges"] },
        { kind: "board", required: ["sections"] },
      ];
      const variantClauses = (includeBoard: boolean) =>
        answerVariantRequirements
          .filter(({ kind }) => includeBoard || kind !== "board")
          .map(({ kind, required }) => ({
            properties: { kind: { enum: [kind] } },
            required,
          }));

      tools.push({
        type: "function",
        function: {
          name: INTERACTIVE_ANSWER_TOOL_NAME,
          description:
            "Choose the most useful response for the task: plain text, one focused interactive answer, or a composed experience with 2–6 distinct sections. Supported sections are short text, chart, comparison, calculator, step explainer, and a selectable relationship/process diagram. Combine sections when they genuinely help (for example, a comparison plus a chart); avoid duplicating the surrounding prose. Calculator controls update locally and can drive multiple outputs. Use only values provided by the user or established by available tools; label assumptions and sample data. Controls cannot run arbitrary code or access files.",
          parameters: {
            type: "object",
            anyOf: variantClauses(true),
            properties: {
              kind: {
                type: "string",
                enum: ["chart", "comparison", "calculator", "steps", "text", "diagram", "board"],
                description: "Choose one visual form, or board to combine 2–6 useful sections.",
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
              orientation: {
                type: "string",
                enum: ["vertical", "horizontal"],
                description: "Optional bar chart layout. Horizontal is best for many or long category labels.",
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
              outputs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    formula: { type: "string" },
                    suffix: { type: "string" },
                  },
                  required: ["label", "formula"],
                  additionalProperties: false,
                },
                description: "Optional 1–4 calculated outputs driven by the same slider inputs. Each formula uses the input ids.",
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
              body: {
                type: "string",
                description: "Plain text for a short standalone section.",
              },
              nodes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    label: { type: "string" },
                    description: { type: "string" },
                    x: { type: "number" },
                    y: { type: "number" },
                  },
                  required: ["id", "label", "description", "x", "y"],
                  additionalProperties: false,
                },
                description: "Diagram nodes positioned from 20 to 80 on x and 14 to 86 on y; keep pairs at least 28 percentage points apart horizontally or 16 vertically.",
              },
              edges: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    from: { type: "string" },
                    to: { type: "string" },
                    label: { type: "string" },
                  },
                  required: ["from", "to"],
                  additionalProperties: false,
                },
                description: "Connections between diagram node ids, with optional short labels.",
              },
              sections: {
                type: "array",
                items: {
                  type: "object",
                  anyOf: variantClauses(false),
                  properties: {
                    kind: {
                      type: "string",
                      enum: ["text", "chart", "comparison", "calculator", "steps", "diagram"],
                    },
                    title: { type: "string" },
                    summary: { type: "string" },
                    body: { type: "string" },
                    chartType: { type: "string", enum: ["bar", "line"] },
                    orientation: { type: "string", enum: ["vertical", "horizontal"] },
                    labels: { type: "array", items: { type: "string" } },
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
                    },
                    yAxisLabel: { type: "string" },
                    columns: { type: "array", items: { type: "string" } },
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
                    },
                    formula: { type: "string" },
                    outputs: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          label: { type: "string" },
                          formula: { type: "string" },
                          suffix: { type: "string" },
                        },
                        required: ["label", "formula"],
                        additionalProperties: false,
                      },
                    },
                    resultLabel: { type: "string" },
                    resultSuffix: { type: "string" },
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
                    },
                    nodes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          label: { type: "string" },
                          description: { type: "string" },
                          x: { type: "number" },
                          y: { type: "number" },
                        },
                        required: ["id", "label", "description", "x", "y"],
                        additionalProperties: false,
                      },
                      description: "Keep node pairs at least 28 percentage points apart horizontally or 16 vertically to prevent overlap.",
                    },
                    edges: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          from: { type: "string" },
                          to: { type: "string" },
                          label: { type: "string" },
                        },
                        required: ["from", "to"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["kind", "title"],
                  additionalProperties: false,
                },
                description: "Two to six distinct native sections; each section uses only its fields for its kind.",
              },
            },
            required: ["kind", "title"],
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
