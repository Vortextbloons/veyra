import type { ProviderToolCall } from "@/lib/providers/types";
import { ASK_QUESTION_TOOL_NAME } from "@/lib/tool-registry";
import { getToolCallUi } from "@/lib/tool-call-ui";
import { useChatStore } from "@/stores/chat-store";
import {
  registerPendingQuestionAbort,
  unregisterPendingQuestionAbort,
} from "@/modules/chat/pending-question-registry";

type QuestionItem = { text: string; options?: string[] };

const MAX_QUESTION_TEXT_LEN = 500;
const MAX_OPTION_LEN = 200;
const MAX_OPTIONS_COUNT = 10;

let pendingResolve: ((answers: Record<number, string>) => void) | null = null;

export function resolvePendingQuestion(answers: Record<number, string>) {
  if (pendingResolve) {
    pendingResolve(answers);
    pendingResolve = null;
    unregisterPendingQuestionAbort();
  }
}

function sanitizeString(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) + "…" : trimmed;
}

function parseQuestions(call: ProviderToolCall): QuestionItem[] {
  const raw = call.arguments.questions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (q): q is { text: string; options?: string[] } =>
        typeof q === "object" && q !== null && typeof (q as Record<string, unknown>).text === "string",
    )
    .slice(0, MAX_OPTIONS_COUNT)
    .map((q) => {
      const text = sanitizeString(q.text, MAX_QUESTION_TEXT_LEN);
      const rawOptions = Array.isArray(q.options) ? (q.options as unknown[]) : undefined;
      const options = rawOptions
        ?.filter((o): o is string => typeof o === "string")
        .map((o) => sanitizeString(o, MAX_OPTION_LEN))
        .filter((o) => o.length > 0);
      return { text, options: options && options.length > 0 ? options : undefined };
    });
}

export function executeAskQuestionCall(
  call: ProviderToolCall,
): Promise<string> {
  const chatStore = useChatStore.getState();
  const label = getToolCallUi(ASK_QUESTION_TOOL_NAME).label;
  const questions = parseQuestions(call);

  if (questions.length === 0) {
    const error = "Invalid ask_question tool arguments: no valid questions provided.";
    chatStore.setStreamingToolState({
      id: call.id,
      name: call.name,
      label,
      phase: "error",
      error,
    });
    return Promise.resolve(`Tool result for ${ASK_QUESTION_TOOL_NAME}: ${error}`);
  }

  const preview = questions.length === 1
    ? (questions[0].text.length > 120 ? questions[0].text.slice(0, 120) + "…" : questions[0].text)
    : `${questions.length} questions`;

  chatStore.setStreamingToolState({
    id: call.id,
    name: call.name,
    label,
    phase: "running",
    input: preview,
  });

  chatStore.setPendingQuestion({
    toolCallId: call.id,
    questions,
    answers: {},
  });

  return new Promise<string>((resolve) => {
    pendingResolve = (answers: Record<number, string>) => {
      unregisterPendingQuestionAbort();
      chatStore.setPendingQuestion(null);

      const answerParts = questions.map((_q, i) => `Q${i + 1}: ${answers[i] ?? "(no answer)"}`);
      const summary = questions.length === 1 ? answerParts[0] : answerParts.join(" | ");

      chatStore.setStreamingToolState({
        id: call.id,
        name: call.name,
        label,
        phase: answers && Object.keys(answers).length > 0 ? "done" : "error",
        input: preview,
        detail: summary,
        ...(answers && Object.keys(answers).length === 0 ? { error: "Question aborted" } : {}),
      });

      resolve(`Tool result for ${ASK_QUESTION_TOOL_NAME}: ${summary}`);
    };

    registerPendingQuestionAbort(() => {
      if (pendingResolve) {
        pendingResolve({});
        pendingResolve = null;
      }
    });
  });
}
