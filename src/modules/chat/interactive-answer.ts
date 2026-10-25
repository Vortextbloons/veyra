export type InteractiveAnswerBase = {
  version: 1;
  id: string;
  title: string;
  summary?: string;
};

export type InteractiveAnswerChart = InteractiveAnswerBase & {
  kind: "chart";
  chartType: "bar" | "line";
  orientation?: "vertical" | "horizontal";
  labels: string[];
  series: Array<{ name: string; values: number[] }>;
  yAxisLabel?: string;
};

export type InteractiveAnswerComparison = InteractiveAnswerBase & {
  kind: "comparison";
  columns: string[];
  rows: Array<{ label: string; values: string[] }>;
};

export type InteractiveAnswerCalculator = InteractiveAnswerBase & {
  kind: "calculator";
  inputs: Array<{
    id: string;
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    suffix?: string;
  }>;
  formula: string;
  resultLabel: string;
  resultSuffix?: string;
  outputs?: Array<{ label: string; formula: string; suffix?: string }>;
};

export type InteractiveAnswerSteps = InteractiveAnswerBase & {
  kind: "steps";
  steps: Array<{ title: string; description: string }>;
};

export type InteractiveAnswerText = InteractiveAnswerBase & {
  kind: "text";
  body: string;
};

export type InteractiveAnswerDiagram = InteractiveAnswerBase & {
  kind: "diagram";
  nodes: Array<{
    id: string;
    label: string;
    description: string;
    x: number;
    y: number;
  }>;
  edges: Array<{ from: string; to: string; label?: string }>;
};

export type InteractiveAnswerSection =
  | InteractiveAnswerText
  | InteractiveAnswerChart
  | InteractiveAnswerComparison
  | InteractiveAnswerCalculator
  | InteractiveAnswerSteps
  | InteractiveAnswerDiagram;

export type InteractiveAnswerBoard = InteractiveAnswerBase & {
  kind: "board";
  sections: InteractiveAnswerSection[];
};

export type InteractiveAnswer =
  | InteractiveAnswerSection
  | InteractiveAnswerBoard;

export type InteractiveAnswerNormalization =
  | { ok: true; answer: InteractiveAnswer }
  | { ok: false; error: string };

export const MAX_INTERACTIVE_ANSWER_CHARS = 24_000;

const MAX_ABS_VALUE = 1_000_000_000;

export function summarizeInteractiveAnswer(answer: InteractiveAnswer): string {
  const kindLabel = answer.kind === "steps"
    ? "step-by-step explanation"
    : answer.kind === "board"
      ? "interactive experience"
      : answer.kind;
  const summary = typeof answer.summary === "string" ? answer.summary.trim() : "";
  const sections = answer.kind === "board"
    ? " Includes " + answer.sections.map((section) => section.kind).join(", ") + "."
    : "";
  return "Interactive " + kindLabel + ": " + answer.title + (summary ? ". " + summary : ".") + sections;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function textArray(value: unknown, min: number, max: number, itemMax: number): string[] | undefined {
  if (!Array.isArray(value) || value.length < min || value.length > max) return undefined;
  const result = value.map((item) => text(item, itemMax));
  return result.every((item): item is string => Boolean(item)) ? result : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_ABS_VALUE
    ? value
    : undefined;
}

function baseFields(raw: Record<string, unknown>, id: string) {
  const title = text(raw.title, 80);
  if (!title) return { error: "Give the interactive answer a title under 80 characters." } as const;
  const summary = raw.summary === undefined ? undefined : text(raw.summary, 240);
  if (raw.summary !== undefined && !summary) {
    return { error: "Keep the interactive answer summary under 240 characters." } as const;
  }
  return {
    fields: {
      version: 1 as const,
      id,
      title,
      ...(summary ? { summary } : {}),
    },
  } as const;
}

export function normalizeInteractiveAnswer(
  raw: Record<string, unknown>,
  id: string,
): InteractiveAnswerNormalization {
  return normalizeInteractiveAnswerValue(raw, id, true);
}

function normalizeInteractiveAnswerValue(
  raw: Record<string, unknown>,
  id: string,
  allowBoard: boolean,
): InteractiveAnswerNormalization {
  if (raw.version !== undefined && raw.version !== 1) {
    return { ok: false, error: "This interactive answer version is not supported." };
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    return { ok: false, error: "The interactive answer could not be read." };
  }
  if (serialized.length > MAX_INTERACTIVE_ANSWER_CHARS) {
    return { ok: false, error: "The interactive answer is too large. Keep it under 24 KB." };
  }

  const base = baseFields(raw, id);
  if ("error" in base) {
    return {
      ok: false,
      error: typeof base.error === "string" ? base.error : "The interactive answer is missing a title.",
    };
  }

  if (raw.kind === "board") {
    if (!allowBoard || !Array.isArray(raw.sections) || raw.sections.length < 2 || raw.sections.length > 6) {
      return { ok: false, error: "An interactive experience needs 2–6 sections and cannot contain another experience." };
    }
    const sections = raw.sections.map((section, index) => {
      if (!isRecord(section)) return undefined;
      const normalized = normalizeInteractiveAnswerValue(section, id + "_section_" + (index + 1), false);
      return normalized.ok ? normalized.answer : undefined;
    });
    if (sections.some((section) => !section)) {
      return { ok: false, error: "Every experience section must be a valid text, chart, comparison, calculator, explainer, or diagram." };
    }
    return {
      ok: true,
      answer: {
        ...base.fields,
        kind: "board",
        sections: sections as InteractiveAnswerSection[],
      },
    };
  }

  if (raw.kind === "text") {
    const body = text(raw.body, 1600);
    if (!body) return { ok: false, error: "A text section needs a short body under 1,600 characters." };
    return { ok: true, answer: { ...base.fields, kind: "text", body } };
  }

  if (raw.kind === "diagram") {
    if (!Array.isArray(raw.nodes) || raw.nodes.length < 2 || raw.nodes.length > 10) {
      return { ok: false, error: "A diagram needs 2–10 nodes." };
    }
    const nodes = raw.nodes.map((entry) => {
      if (!isRecord(entry)) return undefined;
      const nodeId = text(entry.id, 24);
      const label = text(entry.label, 48);
      const description = text(entry.description, 240);
      const x = finiteNumber(entry.x);
      const y = finiteNumber(entry.y);
      if (!nodeId || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(nodeId) || !label || !description || x === undefined || y === undefined || x < 20 || x > 80 || y < 14 || y > 86) {
        return undefined;
      }
      return { id: nodeId, label, description, x, y };
    });
    if (nodes.some((node) => !node) || new Set((nodes as NonNullable<(typeof nodes)[number]>[]).map((node) => node.id)).size !== nodes.length) {
      return { ok: false, error: "Diagram nodes need unique ids, labels, descriptions, x positions from 20–80, and y positions from 14–86." };
    }
    const validNodes = nodes as NonNullable<(typeof nodes)[number]>[];
    const hasOverlappingNodes = validNodes.some((node, index) =>
      validNodes.slice(index + 1).some((other) =>
        Math.abs(node.x - other.x) < 28 && Math.abs(node.y - other.y) < 16,
      ),
    );
    if (hasOverlappingNodes) {
      return { ok: false, error: "Diagram nodes overlap. Space each pair at least 28 percentage points apart horizontally or 16 vertically." };
    }
    if (!Array.isArray(raw.edges) || raw.edges.length < 1 || raw.edges.length > 16) {
      return { ok: false, error: "A diagram needs 1–16 connections." };
    }
    const nodeIds = new Set(validNodes.map((node) => node.id));
    const edges = raw.edges.map((entry) => {
      if (!isRecord(entry)) return undefined;
      const from = text(entry.from, 24);
      const to = text(entry.to, 24);
      const label = entry.label === undefined ? undefined : text(entry.label, 36);
      if (!from || !to || from === to || !nodeIds.has(from) || !nodeIds.has(to) || (entry.label !== undefined && !label)) {
        return undefined;
      }
      return { from, to, ...(label ? { label } : {}) };
    });
    if (edges.some((edge) => !edge)) {
      return { ok: false, error: "Every diagram connection must join two different existing nodes." };
    }
    return {
      ok: true,
      answer: {
        ...base.fields,
        kind: "diagram",
        nodes: validNodes,
        edges: edges as InteractiveAnswerDiagram["edges"],
      },
    };
  }

  if (raw.kind === "chart") {
    const chartType = raw.chartType === "line" ? "line" : raw.chartType === "bar" ? "bar" : undefined;
    const orientation = raw.orientation === undefined
      ? undefined
      : raw.orientation === "horizontal" || raw.orientation === "vertical"
        ? raw.orientation
        : null;
    const labels = textArray(raw.labels, 2, 12, 32);
    if (!chartType || orientation === null || !labels || !Array.isArray(raw.series) || raw.series.length < 1 || raw.series.length > 4) {
      return { ok: false, error: "A chart needs 2–12 labels, a bar or line style, and 1–4 data series." };
    }
    const series = raw.series.map((entry) => {
      if (!isRecord(entry)) return undefined;
      const name = text(entry.name, 48);
      const values = Array.isArray(entry.values) ? entry.values.map(finiteNumber) : undefined;
      if (!name || !values || values.length !== labels.length || values.some((value) => value === undefined)) {
        return undefined;
      }
      return { name, values: values as number[] };
    });
    if (series.some((entry) => !entry)) {
      return { ok: false, error: "Each chart series needs a name and one finite number for every label." };
    }
    const yAxisLabel = raw.yAxisLabel === undefined ? undefined : text(raw.yAxisLabel, 36);
    if (raw.yAxisLabel !== undefined && !yAxisLabel) {
      return { ok: false, error: "Keep the chart axis label under 36 characters." };
    }
    return {
      ok: true,
      answer: {
        ...base.fields,
        kind: "chart",
        chartType,
        ...(orientation ? { orientation } : {}),
        labels,
        series: series as InteractiveAnswerChart["series"],
        ...(yAxisLabel ? { yAxisLabel } : {}),
      },
    };
  }

  if (raw.kind === "comparison") {
    const columns = textArray(raw.columns, 2, 6, 36);
    if (!columns || !Array.isArray(raw.rows) || raw.rows.length < 1 || raw.rows.length > 10) {
      return { ok: false, error: "A comparison needs 2–6 columns and 1–10 rows." };
    }
    const rows = raw.rows.map((entry) => {
      if (!isRecord(entry)) return undefined;
      const label = text(entry.label, 48);
      const values = textArray(entry.values, columns.length, columns.length, 120);
      return label && values ? { label, values } : undefined;
    });
    if (rows.some((entry) => !entry)) {
      return { ok: false, error: "Each comparison row needs a label and one text value per column." };
    }
    return {
      ok: true,
      answer: {
        ...base.fields,
        kind: "comparison",
        columns,
        rows: rows as InteractiveAnswerComparison["rows"],
      },
    };
  }

  if (raw.kind === "calculator") {
    if (!Array.isArray(raw.inputs) || raw.inputs.length < 1 || raw.inputs.length > 6) {
      return { ok: false, error: "A calculator needs 1–6 inputs." };
    }
    const inputs = raw.inputs.map((entry) => {
      if (!isRecord(entry)) return undefined;
      const id = text(entry.id, 21);
      const label = text(entry.label, 48);
      const value = finiteNumber(entry.value);
      const min = finiteNumber(entry.min);
      const max = finiteNumber(entry.max);
      const step = finiteNumber(entry.step);
      const suffix = entry.suffix === undefined ? undefined : text(entry.suffix, 12);
      if (
        !id ||
        !/^[A-Za-z][A-Za-z0-9_]*$/.test(id) ||
        !label ||
        value === undefined ||
        min === undefined ||
        max === undefined ||
        step === undefined ||
        min >= max ||
        max - min > 1_000_000 ||
        step <= 0 ||
        step > max - min ||
        value < min ||
        value > max ||
        (entry.suffix !== undefined && !suffix)
      ) {
        return undefined;
      }
      return { id, label, value, min, max, step, ...(suffix ? { suffix } : {}) };
    });
    if (inputs.some((entry) => !entry)) {
      return { ok: false, error: "Calculator inputs need valid names, values, and bounded slider ranges." };
    }
    const validInputs = inputs as InteractiveAnswerCalculator["inputs"];
    if (new Set(validInputs.map((input) => input.id)).size !== validInputs.length) {
      return { ok: false, error: "Calculator input names must be unique." };
    }
    const initialValues = Object.fromEntries(validInputs.map((input) => [input.id, input.value]));
    let outputs: InteractiveAnswerCalculator["outputs"];
    if (raw.outputs !== undefined) {
      if (!Array.isArray(raw.outputs) || raw.outputs.length < 1 || raw.outputs.length > 4) {
        return { ok: false, error: "A calculator can show 1–4 results." };
      }
      const normalizedOutputs = raw.outputs.map((entry) => {
        if (!isRecord(entry)) return undefined;
        const label = text(entry.label, 48);
        const outputFormula = text(entry.formula, 160);
        const suffix = entry.suffix === undefined ? undefined : text(entry.suffix, 12);
        if (!label || !outputFormula || (entry.suffix !== undefined && !suffix) || evaluateInteractiveFormula(outputFormula, initialValues) === undefined) {
          return undefined;
        }
        return { label, formula: outputFormula, ...(suffix ? { suffix } : {}) };
      });
      if (normalizedOutputs.some((output) => !output)) {
        return { ok: false, error: "Each calculator result needs a valid label and a finite arithmetic formula." };
      }
      const validOutputs = normalizedOutputs as NonNullable<InteractiveAnswerCalculator["outputs"]>;
      if (new Set(validOutputs.map((output) => output.label.toLowerCase())).size !== validOutputs.length) {
        return { ok: false, error: "Calculator result labels must be unique." };
      }
      outputs = validOutputs;
    }
    const formula = outputs?.[0]?.formula ?? text(raw.formula, 160);
    const resultLabel = outputs?.[0]?.label ?? text(raw.resultLabel, 48);
    const resultSuffix = outputs?.[0]?.suffix ?? (raw.resultSuffix === undefined ? undefined : text(raw.resultSuffix, 12));
    if (!formula || !resultLabel || (raw.resultSuffix !== undefined && !resultSuffix)) {
      return { ok: false, error: "A calculator needs a short formula and result label, or one or more result formulas." };
    }
    if (!outputs && evaluateInteractiveFormula(formula, initialValues) === undefined) {
      return { ok: false, error: "The calculator formula is invalid or does not produce a finite result." };
    }
    if (!outputs) outputs = [{ label: resultLabel, formula, ...(resultSuffix ? { suffix: resultSuffix } : {}) }];
    return {
      ok: true,
      answer: {
        ...base.fields,
        kind: "calculator",
        inputs: validInputs,
        formula,
        resultLabel,
        ...(resultSuffix ? { resultSuffix } : {}),
        outputs,
      },
    };
  }

  if (raw.kind === "steps") {
    if (!Array.isArray(raw.steps) || raw.steps.length < 2 || raw.steps.length > 12) {
      return { ok: false, error: "A step explainer needs 2–12 steps." };
    }
    const steps = raw.steps.map((entry) => {
      if (!isRecord(entry)) return undefined;
      const title = text(entry.title, 72);
      const description = text(entry.description, 360);
      return title && description ? { title, description } : undefined;
    });
    if (steps.some((entry) => !entry)) {
      return { ok: false, error: "Each step needs a short title and description." };
    }
    return {
      ok: true,
      answer: {
        ...base.fields,
        kind: "steps",
        steps: steps as InteractiveAnswerSteps["steps"],
      },
    };
  }

  return { ok: false, error: "Choose a supported interactive answer: chart, comparison, calculator, or steps." };
}

export function evaluateInteractiveFormula(
  expression: string,
  values: Record<string, number>,
): number | undefined {
  if (!expression || expression.length > 160) return undefined;

  const tokens: string[] = [];
  const tokenPattern = /\s*([A-Za-z][A-Za-z0-9_]*|(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/^])\s*/gy;
  let offset = 0;
  while (offset < expression.length) {
    if (/^\s*$/.test(expression.slice(offset))) break;
    tokenPattern.lastIndex = offset;
    const match = tokenPattern.exec(expression);
    if (!match) return undefined;
    tokens.push(match[1]);
    offset = tokenPattern.lastIndex;
  }
  if (tokens.length === 0) return undefined;

  let cursor = 0;
  const parsePrimary = (): number | undefined => {
    const token = tokens[cursor++];
    if (token === undefined) return undefined;
    if (token === "(") {
      const result = parseAddSub();
      if (tokens[cursor++] !== ")") return undefined;
      return result;
    }
    const numeric = Number(token);
    if (Number.isFinite(numeric) && (/^\d/.test(token) || /^\.\d/.test(token))) {
      return numeric;
    }
    return Object.prototype.hasOwnProperty.call(values, token) && Number.isFinite(values[token])
      ? values[token]
      : undefined;
  };
  const parseUnary = (): number | undefined => {
    if (tokens[cursor] === "+") {
      cursor++;
      return parseUnary();
    }
    if (tokens[cursor] === "-") {
      cursor++;
      const value = parseUnary();
      return value === undefined ? undefined : -value;
    }
    return parsePrimary();
  };
  const parsePower = (): number | undefined => {
    const left = parseUnary();
    if (left === undefined) return undefined;
    if (tokens[cursor] !== "^") return left;
    cursor++;
    const right = parsePower();
    if (right === undefined) return undefined;
    const result = left ** right;
    return Number.isFinite(result) ? result : undefined;
  };
  const parseMulDiv = (): number | undefined => {
    let value = parsePower();
    if (value === undefined) return undefined;
    while (tokens[cursor] === "*" || tokens[cursor] === "/") {
      const operator = tokens[cursor++];
      const right = parsePower();
      if (right === undefined || (operator === "/" && right === 0)) return undefined;
      value = operator === "*" ? value * right : value / right;
      if (!Number.isFinite(value)) return undefined;
    }
    return value;
  };
  const parseAddSub = (): number | undefined => {
    let value = parseMulDiv();
    if (value === undefined) return undefined;
    while (tokens[cursor] === "+" || tokens[cursor] === "-") {
      const operator = tokens[cursor++];
      const right = parseMulDiv();
      if (right === undefined) return undefined;
      value = operator === "+" ? value + right : value - right;
      if (!Number.isFinite(value)) return undefined;
    }
    return value;
  };

  const result = parseAddSub();
  return cursor === tokens.length && result !== undefined ? result : undefined;
}
