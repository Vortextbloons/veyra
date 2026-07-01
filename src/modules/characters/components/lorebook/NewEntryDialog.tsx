import { useState } from "react";
import type {
  CharacterLorebookEntry,
  CharacterLorebookMatchType,
  CharacterRecord,
} from "../../character-types";
import { PRIORITY_LABELS } from "./constants";

export function NewEntryDialog({
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
