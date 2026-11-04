import { useState } from "react";
import { create } from "zustand";

type Question = { sessionId: string; title: string; options?: string[]; answer: (value?: string) => void };
const usePiQuestions = create<{ pending: Question | null }>(() => ({ pending: null }));

// This module owns the short-lived UI request and its abort cleanup together.
// eslint-disable-next-line react-refresh/only-export-components
export function askPiQuestion(sessionId: string, title: string, options: string[] | undefined, signal: AbortSignal): Promise<string | undefined> {
  if (signal.aborted) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const answer = (value?: string) => {
      signal.removeEventListener("abort", cancel);
      if (usePiQuestions.getState().pending?.answer === answer) usePiQuestions.setState({ pending: null });
      resolve(value);
    };
    const cancel = () => answer();
    signal.addEventListener("abort", cancel, { once: true });
    usePiQuestions.getState().pending?.answer();
    usePiQuestions.setState({ pending: { sessionId, title, options, answer } });
  });
}

export function PiQuestion({ sessionId }: { sessionId: string | null }) {
  const pending = usePiQuestions((state) => state.pending);
  if (!pending || pending.sessionId !== sessionId) return null;
  return <QuestionForm key={pending.title} question={pending} />;
}

function QuestionForm({ question }: { question: Question }) {
  const [value, setValue] = useState("");
  return <form className="mx-auto mb-3 w-full max-w-[1052px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4" onSubmit={(event) => { event.preventDefault(); if (value.trim()) question.answer(value.trim()); }}>
    <label className="block text-sm">{question.title}<input autoFocus value={value} onChange={(event) => setValue(event.target.value)} className="mt-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-sm" /></label>
    <div className="mt-3 flex flex-wrap gap-2">{question.options?.map((option) => <button type="button" key={option} className="rounded-lg bg-white/5 px-3 py-2 text-xs" onClick={() => question.answer(option)}>{option}</button>)}<button type="submit" disabled={!value.trim()} className="rounded-lg bg-white/10 px-3 py-2 text-xs">Reply</button><button type="button" onClick={() => question.answer()} className="px-3 py-2 text-xs text-[var(--color-text-dim)]">Skip</button></div>
  </form>;
}
