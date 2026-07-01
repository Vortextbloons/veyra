import { useMemo, useState } from "react";
import {
  Plus,
  WandSparkles,
  BookOpen,
  AlertTriangle,
  Merge,
} from "lucide-react";
import { newId, nowIso } from "@/lib/id";
import type {
  CharacterLorebookEntry,
  CharacterLorebookMatchType,
  CharacterLorebookPosition,
  CharacterRecord,
} from "../character-types";
import { findDuplicateGroups, mergeLorebookGroup } from "../ai-assist/lorebook-tools";
import { Toolbar } from "./lorebook/Toolbar";
import { EntryRow } from "./lorebook/EntryRow";
import { NewEntryDialog } from "./lorebook/NewEntryDialog";
import { GenerateEntriesDialog } from "./lorebook/GenerateEntriesDialog";
import { LorebookTestPanel } from "./lorebook/LorebookTestPanel";

interface LorebookEditorProps {
  character: CharacterRecord;
  draft: CharacterRecord;
  setDraft: (c: CharacterRecord) => void;
}

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
