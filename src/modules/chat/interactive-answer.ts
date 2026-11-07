import { validateProgram } from "@/modules/chat/ui/validate";

/**
 * An interactive answer is an OpenUI Lang program the model composed for this
 * turn, rendered live inside the chat by Veyra's component library.
 */
export type InteractiveAnswer = {
  version: 2;
  id: string;
  /** Optional short heading; the block falls back to "Interactive answer". */
  title?: string;
  /** The openui-lang program. `root = Col(...)` and its statements. */
  program: string;
};

export type InteractiveAnswerNormalization =
  | { ok: true; answer: InteractiveAnswer }
  | { ok: false; error: string };

export const MAX_INTERACTIVE_ANSWER_CHARS = 120_000;

const MAX_TITLE_CHARS = 80;

export function summarizeInteractiveAnswer(answer: InteractiveAnswer): string {
  const title = answer.title?.trim();
  return `Interactive answer${title ? `: ${title}` : ""} (openui-lang program, ${answer.program.length} characters).`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeInteractiveAnswer(
  raw: Record<string, unknown>,
  id: string,
): InteractiveAnswerNormalization {
  if (!isRecord(raw)) {
    return { ok: false, error: "The interactive answer payload must be an object." };
  }
  if (raw.version !== undefined && raw.version !== 2) {
    return { ok: false, error: "This interactive answer version is not supported." };
  }

  const program = typeof raw.program === "string" ? raw.program.trim() : "";
  if (!program) {
    return {
      ok: false,
      error:
        "generate_interactive_answer needs a `program`: the complete openui-lang program, starting with `root = Col(...)`.",
    };
  }
  if (program.length > MAX_INTERACTIVE_ANSWER_CHARS) {
    return {
      ok: false,
      error: `The program is too long (${program.length} characters). Keep it under ${MAX_INTERACTIVE_ANSWER_CHARS} and use @Each to repeat content.`,
    };
  }

  const validation = validateProgram(program);
  if (!validation.ok) return validation;

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (title.length > MAX_TITLE_CHARS) {
    return { ok: false, error: `Keep the interactive answer title under ${MAX_TITLE_CHARS} characters.` };
  }

  return {
    ok: true,
    answer: {
      version: 2,
      id,
      ...(title ? { title } : {}),
      program,
    },
  };
}
