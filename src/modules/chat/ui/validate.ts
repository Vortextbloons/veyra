import { createParser, type LibraryJSONSchema, type ParseResult } from "@openuidev/lang-core";
import { INTERACTIVE_ANSWER_ROOT } from "./generated";
import { INTERACTIVE_ANSWER_SCHEMA } from "./generated-schema";

/**
 * Validation for a model-written OpenUI Lang program. The parser stays
 * permissive at render time, so a program that would render only part of the
 * answer is rejected here and the reason is handed back to the model to fix.
 *
 * The schema is generated from the component library (`npm run prompt:ui`), so
 * this module never has to load the React renderer.
 */

let parser: ReturnType<typeof createParser> | null = null;

function getParser() {
  parser ??= createParser(INTERACTIVE_ANSWER_SCHEMA as LibraryJSONSchema, INTERACTIVE_ANSWER_ROOT);
  return parser;
}

export type ProgramValidation = { ok: true } | { ok: false; error: string };

export const MAX_PROGRAM_CHARS = 100_000;

function describe(result: ParseResult): string[] {
  const problems: string[] = [];
  for (const error of result.meta.errors.slice(0, 4)) {
    problems.push(error.message);
  }
  if (result.meta.unresolved.length) {
    problems.push(`Undefined names used but never defined: ${result.meta.unresolved.slice(0, 8).join(", ")}.`);
  }
  if (result.meta.orphaned.length) {
    problems.push(
      `Statements defined but never referenced from root (they are dropped): ${result.meta.orphaned.slice(0, 8).join(", ")}.`,
    );
  }
  return problems;
}

export function validateProgram(program: string): ProgramValidation {
  const trimmed = program.trim();
  if (!trimmed) {
    return { ok: false, error: "The program is empty. Write an openui-lang program that starts with `root = Col(...)`." };
  }
  if (trimmed.length > MAX_PROGRAM_CHARS) {
    return {
      ok: false,
      error: `The program is too long (${trimmed.length} characters). Keep it under ${MAX_PROGRAM_CHARS}.`,
    };
  }
  if (/^```/m.test(trimmed)) {
    return { ok: false, error: "Remove the markdown code fence: the program argument holds openui-lang statements only." };
  }

  let result: ParseResult;
  try {
    result = getParser().parse(trimmed);
  } catch (error) {
    return {
      ok: false,
      error: `The program could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // A component error can prevent root construction. Report that cause before
  // suggesting a missing root or unreachable statements as secondary symptoms.
  if (result.meta.errors.length) {
    const errors = result.meta.errors.slice(0, 4).map((error) => error.message);
    const hint = errors.some((message) => message.includes('"Stack"'))
      ? " Use Col([...]) for vertical layout or Row([...]) for horizontal layout; Stack is not supported."
      : "";
    return { ok: false, error: `Fix these openui-lang problems and call the tool again: ${errors.join(" ")}${hint}` };
  }

  if (!result.root) {
    const problems = describe(result);
    return {
      ok: false,
      error:
        "The program has no renderable root. Start the program with a single `root = Col(...)` statement that references every other statement." +
        (problems.length ? ` Problems: ${problems.join(" ")}` : ""),
    };
  }

  if (result.meta.incomplete) {
    return { ok: false, error: "The program is incomplete: a statement or call is cut off. Write the whole program." };
  }

  const problems = describe(result);
  if (problems.length) {
    return { ok: false, error: `Fix these openui-lang problems and call the tool again: ${problems.join(" ")}` };
  }

  return { ok: true };
}
