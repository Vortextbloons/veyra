import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  WandSparkles,
  BookOpen,
  TestTube2,
  Merge,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { newId, nowIso } from "@/lib/id";
import type {
  CharacterLorebookEntry,
  CharacterLorebookMatchType,
  CharacterLorebookPosition,
  CharacterRecord,
} from "../character-types";
import { useCharacterAssistStore } from "../ai-assist/ai-assist-store";
import { useAssistJob, useAssistRunner, useCancelOnUnmount } from "../ai-assist/use-assist-job";
import { StreamingPreview, WandButton } from "../ai-assist/WandButton";
import { findDuplicateGroups, mergeLorebookGroup, testLorebook } from "../ai-assist/lorebook-tools";
import { useChatStore } from "@/stores/chat-store";

interface LorebookEditorProps {
  character: CharacterRecord;
  draft: CharacterRecord;
  setDraft: (c: CharacterRecord) => void;
}

const PRIORITY_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "1 · Trivia",
  2: "2 · Background",
  3: "3 · Standard",
  4: "4 · Important",
  5: "5 · Critical",
};

export function LorebookEditor({ character, draft, setDraft }: LorebookEditorProps) {
  const entries = useMemo(
    () => draft.lorebookEntries ?? [],
    [draft.lorebookEntries],
  );
  const setEntries = (next: CharacterLorebookEntry[]) =>
    setDraft({ ...draft, lorebookEntries: next });

  const [showAdd, setShowAdd] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showTest, setShowTest] = useState(false);

  const duplicateGroups = useMemo(
    () => findDuplicateGroups(entries),
    [entries],
  );

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = (entry: Omit<CharacterLorebookEntry, "id" | "characterId" | "createdAt" | "updatedAt">) => {
    const now = nowIso();
    setEntries([
      ...entries,
      {
        ...entry,
        id: newId("lbe"),
        characterId: character.id,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    setShowAdd(false);
  };

  const handleUpdate = (id: string, patch: Partial<CharacterLorebookEntry>) => {
    setEntries(
      entries.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: nowIso() } : e)),
    );
  };

  const handleRemove = (id: string) => {
    setEntries(entries.filter((e) => e.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleMove = (id: string, direction: -1 | 1) => {
    const idx = entries.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= entries.length) return;
    const next = [...entries];
    [next[idx], next[target]] = [next[target], next[idx]];
    next.forEach((e, i) => (e.insertionOrder = i));
    setEntries(next);
  };

  const handleMerge = (ids: string[]) => {
    if (ids.length < 2) return;
    const group = entries.filter((e) => ids.includes(e.id));
    const primary = group[0];
    const merged = mergeLorebookGroup(group, primary.id);
    const rest = entries.filter((e) => !ids.includes(e.id));
    setEntries([...rest, merged]);
    setSelectedIds(new Set());
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <Toolbar
        character={character}
        entries={entries}
        selectedIds={selectedIds}
        onAdd={() => setShowAdd(true)}
        onGenerate={() => setShowGenerate(true)}
        onSuggestKeys={() => {
          // handled inside the entry rows
        }}
        onTest={() => setShowTest((v) => !v)}
        showTest={showTest}
        onClearSelection={() => setSelectedIds(new Set())}
        onMergeSelected={() => handleMerge(Array.from(selectedIds))}
        onAddSuggested={(newEntries) => {
          const now = nowIso();
          const ready = newEntries.map((e, i) => ({
            id: newId("lbe"),
            characterId: character.id,
            keys: e.keys,
            secondaryKeys: [],
            content: e.content,
            constant: false,
            selective: false,
            insertionOrder: entries.length + i,
            priority: Math.max(1, Math.min(5, e.priority)) as 1 | 2 | 3 | 4 | 5,
            enabled: true,
            matchType: "any" as CharacterLorebookMatchType,
            caseSensitive: false,
            scope: "character" as const,
            comment: e.comment,
            position: "before" as CharacterLorebookPosition,
            probability: 100,
            createdAt: now,
            updatedAt: now,
          }));
          setEntries([...entries, ...ready]);
        }}
      />

      {duplicateGroups.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2 text-[12px] text-amber-200">
            <AlertTriangle className="size-3.5" />
            <span>
              {duplicateGroups.length} potential duplicate group
              {duplicateGroups.length === 1 ? "" : "s"} found.
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            {duplicateGroups.map((g) => (
              <div
                key={g.primaryId}
                className="flex items-center gap-2 text-[12px] text-amber-100"
              >
                <span className="font-mono text-[10.5px] text-amber-200/80">
                  {(g.score * 100).toFixed(0)}%
                </span>
                <span className="truncate">
                  {g.ids
                    .map((id) => entries.find((e) => e.id === id)?.comment ?? entries.find((e) => e.id === id)?.keys.join(",") ?? id)
                    .join(" · ")}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIds(new Set(g.ids));
                    handleMerge(g.ids);
                  }}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-amber-300/30 px-2 py-0.5 text-[11px] hover:bg-amber-500/20"
                >
                  <Merge className="size-3" />
                  Merge
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showTest && (
        <LorebookTestPanel character={character} entries={entries} />
      )}

      <div className="flex flex-col gap-2">
        {entries.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-[12px] text-[var(--color-text-dim)]">
            <BookOpen className="mx-auto mb-2 size-6 opacity-50" />
            <p>No lorebook entries yet.</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-[11.5px] font-medium text-white hover:brightness-110"
              >
                <Plus className="mr-1 inline size-3" />
                Add entry
              </button>
              <button
                type="button"
                onClick={() => setShowGenerate(true)}
                className="rounded-md border border-emerald-300/30 bg-emerald-300/[0.06] px-2.5 py-1.5 text-[11.5px] font-medium text-emerald-200 hover:bg-emerald-300/10"
              >
                <WandSparkles className="mr-1 inline size-3" />
                Generate from paragraph
              </button>
            </div>
          </div>
        ) : (
          entries
            .slice()
            .sort((a, b) => a.insertionOrder - b.insertionOrder)
            .map((entry, idx) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                character={character}
                selected={selectedIds.has(entry.id)}
                onToggleSelect={() => toggleSelected(entry.id)}
                onUpdate={(patch) => handleUpdate(entry.id, patch)}
                onRemove={() => handleRemove(entry.id)}
                onMoveUp={() => handleMove(entry.id, -1)}
                onMoveDown={() => handleMove(entry.id, 1)}
                isFirst={idx === 0}
                isLast={idx === entries.length - 1}
              />
            ))
        )}
      </div>

      {showAdd && (
        <NewEntryDialog
          character={character}
          onCancel={() => setShowAdd(false)}
          onAdd={handleAdd}
        />
      )}
      {showGenerate && (
        <GenerateEntriesDialog
          character={character}
          onCancel={() => setShowGenerate(false)}
          onAdd={(e) => {
            const now = nowIso();
            const ready = e.map((x, i) => ({
              id: newId("lbe"),
              characterId: character.id,
              keys: x.keys,
              secondaryKeys: [],
              content: x.content,
              constant: false,
              selective: false,
              insertionOrder: entries.length + i,
              priority: Math.max(1, Math.min(5, x.priority)) as 1 | 2 | 3 | 4 | 5,
              enabled: true,
              matchType: "any" as CharacterLorebookMatchType,
              caseSensitive: false,
              scope: "character" as const,
              comment: x.comment,
              position: "before" as CharacterLorebookPosition,
              probability: 100,
              createdAt: now,
              updatedAt: now,
            }));
            setEntries([...entries, ...ready]);
            setShowGenerate(false);
          }}
        />
      )}
    </div>
  );
}

// ── Toolbar ─────────────────────────────────────────────────────────────────

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

function Toolbar({
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

// ── Entry row ──────────────────────────────────────────────────────────────

function EntryRow({
  entry,
  character,
  selected,
  onToggleSelect,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  entry: CharacterLorebookEntry;
  character: CharacterRecord;
  selected: boolean;
  onToggleSelect: () => void;
  onUpdate: (patch: Partial<CharacterLorebookEntry>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const runner = useAssistRunner();
  const job = useAssistJob(runner.jobId);
  useCancelOnUnmount(runner.jobId);
  const addPendingChange = useCharacterAssistStore((s) => s.addPendingChange);

  const handleAddKey = () => {
    const value = newKey.trim();
    if (!value) return;
    if (entry.keys.includes(value)) {
      setNewKey("");
      return;
    }
    onUpdate({ keys: [...entry.keys, value] });
    setNewKey("");
  };

  const handleRemoveKey = (k: string) => {
    onUpdate({ keys: entry.keys.filter((x) => x !== k) });
  };

  const handleSuggestKeys = () => {
    runner.start(
      { action: "suggest_keys", characterId: character.id, targetField: entry.id },
      { character, selectedEntries: [entry] },
    );
  };

  if (job.result) {
    // The buffer is shown via StreamingPreview; we don't auto-apply because
    // the user may want to choose keys individually.
    // We do, however, capture the JSON if it parses.
    try {
      const trimmed = job.buffer.trim().replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed.keys)) {
        const proposed = (parsed.keys as unknown[]).filter((k) => typeof k === "string") as string[];
        if (proposed.length > 0) {
          addPendingChange({
            characterId: character.id,
            field: `lorebook.${entry.id}.keys`,
            label: `Keys: ${entry.comment ?? entry.keys.slice(0, 2).join(", ")}`,
            before: entry.keys,
            after: Array.from(new Set([...entry.keys, ...proposed])),
            source: "suggest_keys",
          });
        }
        job.clear();
      }
    } catch {
      // ignore parse errors
    }
  }

  return (
    <div
      className={`rounded-md border ${
        selected ? "border-emerald-300/40 bg-emerald-300/[0.04]" : "border-[var(--color-border)] bg-[var(--color-bg)]/40"
      }`}
    >
      <div className="flex items-center gap-2 p-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="size-3.5 rounded border-[var(--color-border)] bg-[var(--color-bg)] accent-emerald-500"
        />
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {entry.keys.length === 0 ? (
            <span className="text-[11px] italic text-[var(--color-text-dim)]">
              (constant, no keys)
            </span>
          ) : (
            entry.keys.map((k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/60 px-2 py-0.5 text-[10.5px] text-white"
              >
                {k}
                <button
                  type="button"
                  onClick={() => handleRemoveKey(k)}
                  className="text-[var(--color-text-dim)] hover:text-white"
                  aria-label={`Remove ${k}`}
                >
                  ×
                </button>
              </span>
            ))
          )}
          {entry.comment && (
            <span className="ml-1 rounded border border-emerald-300/20 bg-emerald-300/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200">
              {entry.comment}
            </span>
          )}
          {entry.constant && (
            <span className="rounded border border-indigo-400/30 bg-indigo-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-indigo-200">
              constant
            </span>
          )}
          {!entry.enabled && (
            <span className="rounded border border-red-400/30 bg-red-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-red-200">
              disabled
            </span>
          )}
          <span className="rounded border border-[var(--color-border)] bg-[var(--color-bg)]/60 px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-dim)]">
            {PRIORITY_LABELS[entry.priority]}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[11px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        >
          {open ? "Close" : "Edit"}
        </button>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="rounded border border-[var(--color-border)] p-1 text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white disabled:opacity-30"
          aria-label="Move up"
        >
          <ChevronUp className="size-3" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="rounded border border-[var(--color-border)] p-1 text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white disabled:opacity-30"
          aria-label="Move down"
        >
          <ChevronDown className="size-3" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded border border-red-400/30 bg-red-500/10 p-1 text-red-200 hover:bg-red-500/20"
          aria-label="Remove"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-2 border-t border-[var(--color-border)] p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddKey();
                }
              }}
              placeholder="Add a trigger key"
              className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12px] text-white focus:border-[var(--color-accent)] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddKey}
              className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[11.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            >
              Add
            </button>
            <WandButton
              compact
              actions={[
                {
                  id: "suggest",
                  label: "Suggest keys",
                  description: "Generate trigger keys for this entry.",
                  instruction: "Suggest trigger keys for this lorebook entry.",
                },
              ]}
              onAction={handleSuggestKeys}
              busy={job.running}
            />
          </div>
          <StreamingPreview
            buffer={job.buffer}
            busy={job.running}
            onCancel={runner.cancel}
            hint="Suggesting keys…"
          />
          <PendingKeyAccept
            jobBuffer={job.buffer}
            entry={entry}
            onApply={(keys) => onUpdate({ keys })}
          />
          <textarea
            value={entry.content}
            onChange={(e) => onUpdate({ content: e.target.value })}
            rows={4}
            placeholder="World-info body"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
                Priority
              </span>
              <select
                value={entry.priority}
                onChange={(e) => onUpdate({ priority: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 })}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
              >
                {Object.entries(PRIORITY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
                Match
              </span>
              <select
                value={entry.matchType}
                onChange={(e) => onUpdate({ matchType: e.target.value as CharacterLorebookMatchType })}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
              >
                <option value="any">Any</option>
                <option value="all">All</option>
                <option value="regex">Regex</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
                Comment
              </span>
              <input
                type="text"
                value={entry.comment ?? ""}
                onChange={(e) => onUpdate({ comment: e.target.value })}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
                Probability (0–100)
              </span>
              <input
                type="number"
                min={0}
                max={100}
                value={entry.probability ?? 100}
                onChange={(e) => onUpdate({ probability: Math.max(0, Math.min(100, Number(e.target.value))) })}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[12px] text-[var(--color-text-dim)]">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={entry.constant}
                onChange={(e) => onUpdate({ constant: e.target.checked })}
                className="size-3.5 rounded border-[var(--color-border)] bg-[var(--color-bg)] accent-[var(--color-accent)]"
              />
              Constant
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={entry.enabled}
                onChange={(e) => onUpdate({ enabled: e.target.checked })}
                className="size-3.5 rounded border-[var(--color-border)] bg-[var(--color-bg)] accent-[var(--color-accent)]"
              />
              Enabled
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={entry.caseSensitive}
                onChange={(e) => onUpdate({ caseSensitive: e.target.checked })}
                className="size-3.5 rounded border-[var(--color-border)] bg-[var(--color-bg)] accent-[var(--color-accent)]"
              />
              Case sensitive
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function PendingKeyAccept({
  jobBuffer,
  entry,
  onApply,
}: {
  jobBuffer: string;
  entry: CharacterLorebookEntry;
  onApply: (keys: string[]) => void;
}) {
  const [proposed, setProposed] = useState<string[] | null>(null);
  if (proposed) {
    return (
      <div className="flex flex-col gap-1.5 rounded-md border border-emerald-300/25 bg-emerald-300/[0.04] p-2">
        <span className="text-[10.5px] uppercase tracking-wide text-emerald-200/80">
          Suggested keys
        </span>
        <div className="flex flex-wrap gap-1.5">
          {proposed.map((k) => {
            const exists = entry.keys.includes(k);
            return (
              <button
                key={k}
                type="button"
                disabled={exists}
                onClick={() => {
                  if (exists) return;
                  onApply([...entry.keys, k]);
                }}
                className={`rounded-md border px-2 py-0.5 text-[10.5px] ${
                  exists
                    ? "border-[var(--color-border)] bg-[var(--color-bg)]/60 text-[var(--color-text-dim)] line-through"
                    : "border-emerald-300/30 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20"
                }`}
              >
                {exists ? "added" : "+ "}
                {k}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onApply(Array.from(new Set([...entry.keys, ...proposed])))}
            className="rounded-md bg-emerald-500/85 px-2 py-1 text-[11px] font-medium text-white"
          >
            Apply all
          </button>
          <button
            type="button"
            onClick={() => setProposed(null)}
            className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }
  if (!jobBuffer) return null;
  const list = parseSuggestedKeysFromBuffer(jobBuffer);
  if (!list) return null;
  return (
    <button
      type="button"
      onClick={() => setProposed(list)}
      className="inline-flex items-center gap-1 self-start rounded-md border border-emerald-300/30 bg-emerald-300/[0.06] px-2.5 py-1 text-[11.5px] text-emerald-200 hover:bg-emerald-300/10"
    >
      <WandSparkles className="size-3" />
      Show {list.length} suggested key{list.length === 1 ? "" : "s"}
    </button>
  );
}

function parseSuggestedKeysFromBuffer(buffer: string): string[] | null {
  try {
    const trimmed = buffer.trim().replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const parsed = JSON.parse(trimmed) as { keys?: unknown };
    if (!Array.isArray(parsed.keys)) return null;
    return (parsed.keys as unknown[]).filter((k) => typeof k === "string") as string[];
  } catch {
    return null;
  }
}

// ── New entry dialog ────────────────────────────────────────────────────────

function NewEntryDialog({
  onCancel,
  onAdd,
}: {
  character: CharacterRecord;
  onCancel: () => void;
  onAdd: (entry: Omit<CharacterLorebookEntry, "id" | "characterId" | "createdAt" | "updatedAt">) => void;
}) {
  const [keys, setKeys] = useState<string[]>([]);
  const [keyInput, setKeyInput] = useState("");
  const [content, setContent] = useState("");
  const [comment, setComment] = useState("");
  const [priority, setPriority] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [matchType, setMatchType] = useState<CharacterLorebookMatchType>("any");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [constant, setConstant] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [probability, setProbability] = useState(100);
  // The new-entry dialog does not use AI suggestions directly, so we don't
  // need to wire up the assist runner here. Keeping the imports in case
  // future revisions add an AI assist button.
  void useAssistRunner;
  void useAssistJob;

  const addKey = () => {
    const v = keyInput.trim();
    if (!v) return;
    if (keys.includes(v)) {
      setKeyInput("");
      return;
    }
    setKeys([...keys, v]);
    setKeyInput("");
  };

  const handleSave = () => {
    if (keys.length === 0 && !constant) return;
    if (!content.trim()) return;
    onAdd({
      keys,
      secondaryKeys: [],
      content: content.trim(),
      constant,
      selective: false,
      insertionOrder: 0,
      priority,
      enabled,
      matchType,
      caseSensitive,
      scope: "character",
      group: undefined,
      comment: comment.trim() || undefined,
      position: "before",
      probability,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="flex w-[480px] max-w-[90vw] flex-col gap-3 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[13px] font-semibold text-white">Add lorebook entry</h3>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
            Trigger keys
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {keys.map((k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/60 px-2 py-0.5 text-[10.5px] text-white"
              >
                {k}
                <button
                  type="button"
                  onClick={() => setKeys(keys.filter((x) => x !== k))}
                  className="text-[var(--color-text-dim)] hover:text-white"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKey();
                }
              }}
              placeholder="Add key and press Enter"
              className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-[12px] text-white focus:border-[var(--color-accent)] focus:outline-none"
            />
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
            Content
          </span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder="World-info body"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
              Comment
            </span>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
              Priority
            </span>
            <select
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
            >
              {Object.entries(PRIORITY_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
              Match
            </span>
            <select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as CharacterLorebookMatchType)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
            >
              <option value="any">Any</option>
              <option value="all">All</option>
              <option value="regex">Regex</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
              Probability
            </span>
            <input
              type="number"
              min={0}
              max={100}
              value={probability}
              onChange={(e) => setProbability(Math.max(0, Math.min(100, Number(e.target.value))))}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-[var(--color-text-dim)]">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={constant}
              onChange={(e) => setConstant(e.target.checked)}
              className="size-3.5 rounded border-[var(--color-border)] bg-[var(--color-bg)] accent-[var(--color-accent)]"
            />
            Constant
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="size-3.5 rounded border-[var(--color-border)] bg-[var(--color-bg)] accent-[var(--color-accent)]"
            />
            Enabled
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              className="size-3.5 rounded border-[var(--color-border)] bg-[var(--color-bg)] accent-[var(--color-accent)]"
            />
            Case sensitive
          </label>
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
            onClick={handleSave}
            disabled={!content.trim() || (keys.length === 0 && !constant)}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <span className="text-[10.5px] text-[var(--color-text-dim)]">
          Tip: enable the entry's "Enabled" toggle, set a priority of 3, and add 2-4 trigger keys for the best default.
        </span>
      </div>
    </div>
  );
}

// ── Generate entries dialog ─────────────────────────────────────────────────

function GenerateEntriesDialog({
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

// ── Test panel ──────────────────────────────────────────────────────────────

function LorebookTestPanel({
  character,
  entries,
}: {
  character: CharacterRecord;
  entries: CharacterLorebookEntry[];
}) {
  const conversations = useChatStore((s) => s.conversations);
  const [conversationId, setConversationId] = useState<string>("");
  const boundConversations = useMemo(
    () => conversations.filter((c) => c.characterId === character.id),
    [conversations, character.id],
  );
  const target = conversationId
    ? conversations.find((c) => c.id === conversationId)
    : boundConversations[0];
  const report = useMemo(() => {
    if (!target) return null;
    return testLorebook(entries, target.messages, {
      scanDepth: character.chatDefaults?.scanDepth,
      maxEntries: character.chatDefaults?.maxLorebookEntries,
    });
  }, [target, entries, character.chatDefaults]);

  return (
    <div className="rounded-md border border-indigo-400/30 bg-indigo-500/[0.06] p-3">
      <div className="mb-2 flex items-center gap-2">
        <TestTube2 className="size-3.5 text-indigo-300" />
        <h4 className="text-[12px] font-semibold text-white">Test against history</h4>
        <span className="ml-auto text-[10.5px] text-[var(--color-text-dim)]">
          {report?.totalEntries ?? entries.length} entries · scan depth {character.chatDefaults?.scanDepth ?? 4}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <select
          value={conversationId}
          onChange={(e) => setConversationId(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12px] text-white"
        >
          <option value="">Auto-pick most recent</option>
          {boundConversations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} ({c.messages.length} messages)
            </option>
          ))}
        </select>
        {boundConversations.length === 0 && (
          <p className="text-[11.5px] text-[var(--color-text-dim)]">
            No chats bound to this character yet. Start a chat to test against real history.
          </p>
        )}
        {report && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] text-[var(--color-text-dim)]">
              {report.matched.length} matched{report.budgetExceeded ? " (budget exceeded)" : ""}.
            </p>
            {report.matched.length === 0 && target && target.messages.length > 0 && (
              <p className="text-[11px] text-[var(--color-text-dim)]">
                No triggers fired. Try lowering scan depth or simplifying keys.
              </p>
            )}
            {report.matched.map((m, i) => (
              <div
                key={i}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-2"
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="rounded border border-emerald-300/20 bg-emerald-300/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200">
                    {m.entry.comment || m.entry.keys.join(",")}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--color-text-dim)]">
                    {PRIORITY_LABELS[m.entry.priority]}
                  </span>
                </div>
                <div className="whitespace-pre-wrap text-[11.5px] text-white/85">{m.entry.content}</div>
                {m.snippet && (
                  <div className="mt-1 truncate text-[10.5px] italic text-[var(--color-text-dim)]">
                    …{m.snippet}…
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
