import { useState } from "react";
import { MessageCircleQuestion, Send } from "lucide-react";
import type { ToolCallState } from "@/modules/chat/chat-types";
import {
  getToolCallUi,
  isToolCallActive,
  TOOL_CALL_ACCENT_STYLES,
  toolCallPhaseLabel,
} from "@/lib/tool-call-ui";
import { ToolCallShell } from "@/modules/chat/components/tool-call-shell";

type QuestionDef = { text: string; options?: string[] };

type AskQuestionBlockProps = {
  state: ToolCallState;
  questions?: QuestionDef[];
  isPending: boolean;
  onAnswer: (answers: Record<number, string>) => void;
};

function SingleQuestion({
  index,
  question,
  answer,
  total,
  onAnswer,
}: {
  index: number;
  question: QuestionDef;
  answer?: string;
  total: number;
  onAnswer: (index: number, value: string) => void;
}) {
  const [freeText, setFreeText] = useState("");

  const handleFreeTextSubmit = () => {
    const trimmed = freeText.trim();
    if (trimmed) {
      onAnswer(index, trimmed);
      setFreeText("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleFreeTextSubmit();
    }
  };

  const isAnswered = Boolean(answer);
  const showNumber = total > 1;

  return (
    <div>
      <div className="mb-2.5 flex items-start gap-2">
        {showNumber && (
          <span
            className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
              isAnswered
                ? "bg-emerald-500/80 text-white"
                : "bg-amber-500/20 text-amber-300"
            }`}
          >
            {index + 1}
          </span>
        )}
        <p className="text-[13px] leading-relaxed text-white/90">
          {question.text}
        </p>
      </div>

      {question.options && question.options.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {question.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onAnswer(index, option)}
              className={`rounded-lg border px-3.5 py-1.5 text-[12.5px] font-medium transition-all active:scale-[0.97] ${
                answer === option
                  ? "border-amber-400/50 bg-amber-500/30 text-white shadow-[0_0_8px_rgba(245,158,11,0.15)]"
                  : "border-amber-500/25 bg-amber-500/10 text-amber-200 hover:border-amber-400/40 hover:bg-amber-500/20 hover:text-white"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer…"
            className="flex-1 rounded-lg border border-amber-500/20 bg-black/20 px-3 py-1.5 text-[12.5px] text-white placeholder:text-white/30 focus:border-amber-400/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleFreeTextSubmit}
            disabled={!freeText.trim()}
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-amber-500/20 text-amber-300 transition-all hover:bg-amber-500/30 hover:text-white disabled:opacity-30 disabled:hover:bg-amber-500/20 disabled:hover:text-amber-300"
          >
            <Send className="size-3.5" />
          </button>
        </div>
      )}

      {isAnswered && (
        <p className="mt-1.5 text-[11px] text-emerald-400/80">
          Answered: {answer}
        </p>
      )}
    </div>
  );
}

export function AskQuestionBlock({
  state,
  questions,
  isPending,
  onAnswer,
}: AskQuestionBlockProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const meta = getToolCallUi(state.name, state.label);
  const Icon = meta.icon || MessageCircleQuestion;
  const isActive = isToolCallActive(state.phase);
  const isError = state.phase === "error";
  const isDone = state.phase === "done";
  const count = questions?.length ?? 0;
  const isSingle = count === 1;
  const allAnswered = count > 0 && (questions ?? []).every((_, i) => answers[i]);

  const handleQuestionAnswer = (index: number, value: string) => {
    const next = { ...answers, [index]: value };
    setAnswers(next);

    if (isSingle) {
      onAnswer(next);
    }
  };

  const handleSubmitAll = () => {
    if (allAnswered) {
      onAnswer(answers);
    }
  };

  return (
    <ToolCallShell
      icon={<Icon className={`size-3 ${TOOL_CALL_ACCENT_STYLES[meta.accent].text}`} />}
      label={state.label || meta.label}
      phaseLabel={
        isPending
          ? isSingle
            ? "Waiting for answer…"
            : `Waiting for ${count} answers…`
          : toolCallPhaseLabel(state.phase, state.attempts)
      }
      accent={meta.accent}
      isActive={isActive}
      isError={isError}
      isDone={isDone}
      inputPreview={isDone ? state.detail : undefined}
    >
      {isPending && questions && (
        <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3">
          <div className={count > 1 ? "space-y-4" : ""}>
            {questions.map((q, i) => (
              <SingleQuestion
                key={i}
                index={i}
                question={q}
                answer={answers[i]}
                total={count}
                onAnswer={handleQuestionAnswer}
              />
            ))}
          </div>

          {!isSingle && (
            <div className="mt-3 flex items-center justify-between border-t border-amber-500/10 pt-3">
              <span className="text-[11px] text-white/40">
                {Object.keys(answers).length} of {count} answered
              </span>
              <button
                type="button"
                onClick={handleSubmitAll}
                disabled={!allAnswered}
                className="rounded-lg bg-amber-500/20 px-3.5 py-1.5 text-[12px] font-medium text-amber-200 transition-all hover:bg-amber-500/30 hover:text-white disabled:opacity-30 disabled:hover:bg-amber-500/20 disabled:hover:text-amber-200"
              >
                Submit All
              </button>
            </div>
          )}
        </div>
      )}
    </ToolCallShell>
  );
}
