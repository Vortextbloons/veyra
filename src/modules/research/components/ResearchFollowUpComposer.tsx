import { useState, useRef } from "react";
import { Send, Loader2 } from "lucide-react";
import type { ResearchRun } from "../research-types";
import { useResearchStore } from "../research-store";
import { aiScheduler } from "@/lib/ai-scheduler";
import { executeResearchRun } from "../research-runtime";

type Props = {
  previousRun: ResearchRun;
};

export function ResearchFollowUpComposer({ previousRun }: Props) {
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const createRun = useResearchStore((s) => s.createRun);

  const canSubmit = value.trim().length > 0 && !isSubmitting;

  const handleSubmit = async () => {
    const text = value.trim();
    if (!text || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const run = await createRun({
        projectId: previousRun.projectId,
        question: text,
        depth: previousRun.depth,
        modelUsed: previousRun.modelUsed,
        providerId: previousRun.providerId,
      });

      aiScheduler.enqueueAiJob({
        type: "research_run",
        priority: 0,
        title: `Research: ${run.question}`,
        description:
          run.question.length > 80 ? run.question.slice(0, 80) + "..." : run.question,
        run: async (signal) => {
          await executeResearchRun(run, signal, () => {
            // Store is already updated inside executeResearchRun
          });
        },
      });

      setValue("");
    } catch (err) {
      console.error("Failed to start follow-up research:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 pb-3 pt-2.5">
      <div className="group/composer relative rounded-2xl border border-[var(--color-border)] bg-gradient-to-b from-[var(--color-panel)] to-[var(--color-bg)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all focus-within:border-[var(--color-accent)]/40 focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_0_0_3px_rgba(99,102,241,0.08)]">
        <div className="flex flex-col gap-1.5">
          <textarea
            ref={textareaRef}
            rows={2}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a follow-up question about this research..."
            disabled={isSubmitting}
            className="block w-full resize-none rounded-md bg-transparent px-2 py-1.5 text-[13px] font-medium leading-snug tracking-[-0.005em] text-white transition-[font-size] duration-200 ease-out placeholder:font-normal placeholder:tracking-normal placeholder:text-[var(--color-text-dim)]/70 focus:outline-none disabled:opacity-50"
          />
          <div className="flex items-center justify-end border-t border-[var(--color-border)]/50 pt-1.5">
            <button
              aria-label="Send follow-up"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="group/send grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--color-accent)] text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4),0_4px_12px_-2px_rgba(99,102,241,0.4)] transition-all hover:brightness-110 hover:shadow-[0_0_0_1px_rgba(99,102,241,0.5),0_6px_16px_-2px_rgba(99,102,241,0.5)] active:scale-95 disabled:opacity-40 disabled:hover:brightness-100 disabled:hover:shadow-[0_0_0_1px_rgba(99,102,241,0.4),0_4px_12px_-2px_rgba(99,102,241,0.4)] disabled:active:scale-100"
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4 transition-transform group-hover/send:translate-x-0.5 group-hover/send:-translate-y-0.5" />
              )}
            </button>
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-center gap-4 text-[11px] text-[var(--color-text-dim)]">
        <span>
          <span className="font-mono">↵</span> to send
        </span>
        <span>
          <span className="font-mono">⇧</span> +{" "}
          <span className="font-mono">↵</span> for new line
        </span>
      </div>
    </div>
  );
}
