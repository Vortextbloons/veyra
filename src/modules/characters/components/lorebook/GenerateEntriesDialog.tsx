import { useMemo, useState } from "react";
import { WandSparkles, Loader2 } from "lucide-react";
import type { CharacterRecord } from "../../character-types";
import { useAssistJob, useAssistRunner, useCancelOnUnmount } from "../../ai-assist/use-assist-job";

export function GenerateEntriesDialog({
  character,
  onCancel,
  onAdd,
}: {
  character: CharacterRecord;
  onCancel: () => void;
  onAdd: (e: Array<{ keys: string[]; content: string; comment?: string; priority: number }>) => void;
}) {
  const [paragraph, setParagraph] = useState("");
  const [maxEntries, setMaxEntries] = useState(6);
  const runner = useAssistRunner();
  const job = useAssistJob(runner.jobId);
  useCancelOnUnmount(runner.jobId);

  const handleGenerate = () => {
    if (!paragraph.trim()) return;
    runner.start(
      {
        action: "suggest_lorebook",
        characterId: character.id,
        options: { paragraph: paragraph.trim(), count: maxEntries },
      },
      { character, paragraph: paragraph.trim() },
    );
  };

  const parsed = useMemo(() => {
    if (!job.result) return null;
    return job.result;
  }, [job.result]);

  if (parsed && parsed.lorebookEntries) {
    const entries = parsed.lorebookEntries.map((e) => ({
      keys: e.keys,
      content: e.content,
      comment: e.comment,
      priority: e.priority,
    }));
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      >
        <div
          className="flex max-h-[80vh] w-[560px] max-w-[95vw] flex-col gap-3 overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-[13px] font-semibold text-white">Generated entries</h3>
          <p className="text-[11.5px] text-[var(--color-text-dim)]">
            Review the suggestions. Add all or cherry-pick individual entries.
          </p>
          <div className="flex-1 space-y-2 overflow-y-auto">
            {entries.map((e, i) => (
              <div
                key={i}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-2"
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="rounded border border-emerald-300/20 bg-emerald-300/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200">
                    {e.comment || "entry"}
                  </span>
                  {e.keys.map((k) => (
                    <span
                      key={k}
                      className="rounded border border-[var(--color-border)] bg-[var(--color-bg)]/60 px-1.5 py-0.5 text-[10px] text-white"
                    >
                      {k}
                    </span>
                  ))}
                </div>
                <div className="whitespace-pre-wrap text-[12px] text-white/85">{e.content}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-2.5 py-1.5 text-[12px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onAdd(entries)}
              className="rounded-md bg-emerald-500/85 px-3 py-1.5 text-[12.5px] font-medium text-white"
            >
              Add all ({entries.length})
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="flex w-[560px] max-w-[95vw] flex-col gap-3 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[13px] font-semibold text-white">Generate from paragraph</h3>
        <p className="text-[11.5px] text-[var(--color-text-dim)]">
          Paste a block of world-info text. The model returns up to N structured entries you can review.
        </p>
        <textarea
          value={paragraph}
          onChange={(e) => setParagraph(e.target.value)}
          rows={8}
          placeholder="Paste world-info text here…"
          className="w-full rounded-md border border-emerald-300/25 bg-[var(--color-bg)] px-3 py-2 text-[12.5px] text-white focus:border-emerald-300/40 focus:outline-none"
        />
        <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-dim)]">
          <span>Max entries:</span>
          <input
            type="number"
            min={1}
            max={20}
            value={maxEntries}
            onChange={(e) => setMaxEntries(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="w-16 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-[12px] text-white focus:border-emerald-300/40 focus:outline-none"
          />
        </label>
        {job.error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
            {job.error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-2.5 py-1.5 text-[12px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={job.running || !paragraph.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/85 px-3 py-1.5 text-[12.5px] font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {job.running ? <Loader2 className="size-3 animate-spin" /> : <WandSparkles className="size-3" />}
            {job.running ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
