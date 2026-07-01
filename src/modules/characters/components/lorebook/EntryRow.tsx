import { useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  WandSparkles,
} from "lucide-react";
import type {
  CharacterLorebookEntry,
  CharacterLorebookMatchType,
  CharacterRecord,
} from "../../character-types";
import { useCharacterAssistStore } from "../../ai-assist/ai-assist-store";
import { useAssistJob, useAssistRunner, useCancelOnUnmount } from "../../ai-assist/use-assist-job";
import { StreamingPreview, WandButton } from "../../ai-assist/WandButton";
import { PRIORITY_LABELS } from "./constants";

export function EntryRow({
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

export function PendingKeyAccept({
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
