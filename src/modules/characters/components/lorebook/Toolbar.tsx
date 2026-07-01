import {
  Plus,
  WandSparkles,
  TestTube2,
  Merge,
} from "lucide-react";
import type {
  CharacterLorebookEntry,
  CharacterRecord,
} from "../../character-types";
import { useAssistJob, useAssistRunner, useCancelOnUnmount } from "../../ai-assist/use-assist-job";

interface ToolbarProps {
  character: CharacterRecord;
  entries: CharacterLorebookEntry[];
  selectedIds: Set<string>;
  onAdd: () => void;
  onGenerate: () => void;
  onSuggestKeys: () => void;
  onTest: () => void;
  showTest: boolean;
  onClearSelection: () => void;
  onMergeSelected: () => void;
  onAddSuggested: (e: Array<{ keys: string[]; content: string; comment?: string; priority: number }>) => void;
}

export function Toolbar({
  character,
  entries,
  selectedIds,
  onAdd,
  onGenerate,
  onTest,
  showTest,
  onClearSelection,
  onMergeSelected,
  onAddSuggested,
}: ToolbarProps) {
  void onAddSuggested;
  const runner = useAssistRunner();
  const job = useAssistJob(runner.jobId);
  useCancelOnUnmount(runner.jobId);

  const handleSuggestKeys = () => {
    const target = entries.find((e) => selectedIds.has(e.id));
    if (!target) return;
    runner.start(
      { action: "suggest_keys", characterId: character.id, targetField: target.id },
      { character, selectedEntries: [target] },
    );
  };

  if (job.result && job.result.lorebookEntries) {
    // Not used here.
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-2">
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-[11.5px] font-medium text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4)] hover:brightness-110"
      >
        <Plus className="size-3" />
        Add entry
      </button>
      <button
        type="button"
        onClick={onGenerate}
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300/30 bg-emerald-300/[0.06] px-2.5 py-1.5 text-[11.5px] font-medium text-emerald-200 hover:bg-emerald-300/10"
      >
        <WandSparkles className="size-3" />
        Generate from paragraph
      </button>
      <button
        type="button"
        onClick={onTest}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] ${
          showTest
            ? "border-indigo-400/50 bg-indigo-500/20 text-white"
            : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        }`}
      >
        <TestTube2 className="size-3" />
        Test against history
      </button>
      <div className="ml-auto flex items-center gap-2 text-[11px] text-[var(--color-text-dim)]">
        {selectedIds.size > 0 && (
          <>
            <span>{selectedIds.size} selected</span>
            <button
              type="button"
              onClick={onClearSelection}
              className="rounded border border-[var(--color-border)] px-2 py-0.5 hover:bg-white/5"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onMergeSelected}
              className="rounded border border-[var(--color-border)] px-2 py-0.5 hover:bg-white/5"
            >
              <Merge className="mr-0.5 inline size-3" />
              Merge
            </button>
            <button
              type="button"
              onClick={handleSuggestKeys}
              className="rounded border border-emerald-300/30 bg-emerald-300/[0.06] px-2 py-0.5 text-emerald-200 hover:bg-emerald-300/10"
            >
              <WandSparkles className="mr-0.5 inline size-3" />
              Suggest keys
            </button>
          </>
        )}
      </div>
    </div>
  );
}
