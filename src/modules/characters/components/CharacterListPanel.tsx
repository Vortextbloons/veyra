import { useMemo, useState } from "react";
import { Drama, Plus, Search, Users, Copy, Download } from "lucide-react";
import { useCharacterStore } from "../character-store";
import type { CharacterRecord } from "../character-types";
import { CharacterAvatar } from "../CharacterAvatar";

interface CharacterListPanelProps {
  onCreate: () => void;
  onDuplicate?: (c: CharacterRecord) => void;
  onExport?: (c: CharacterRecord) => void;
}

function Avatar({ character, size = "md" }: { character: CharacterRecord; size?: "sm" | "md" }) {
  return <CharacterAvatar character={character} size={size} className="shrink-0 rounded-full" />;
}

function CharacterRow({
  character,
  active,
  onSelect,
  onDelete,
  onDuplicate,
  onExport,
}: {
  character: CharacterRecord;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onExport?: () => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${
          active
            ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-soft)]"
            : "border-transparent hover:bg-white/[0.03]"
        }`}
      >
        <Avatar character={character} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12px] font-medium text-white">
              {character.name}
            </span>
            {!character.isGlobal && (
              <span className="shrink-0 rounded border border-[var(--color-border)] px-1 text-[9px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
                p
              </span>
            )}
          </div>
          {character.tagline ? (
            <span className="truncate text-[10.5px] text-[var(--color-text-dim)]">
              {character.tagline}
            </span>
          ) : character.title ? (
            <span className="truncate text-[10.5px] text-[var(--color-text-dim)]">
              {character.title}
            </span>
          ) : null}
        </div>
      </button>
      <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {onDuplicate && (
          <button
            type="button"
            onClick={onDuplicate}
            className="grid size-5 place-items-center rounded bg-white/5 text-[var(--color-text-dim)] hover:bg-white/10 hover:text-white"
            title="Duplicate"
            aria-label="Duplicate character"
          >
            <Copy className="size-2.5" />
          </button>
        )}
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="grid size-5 place-items-center rounded bg-white/5 text-[var(--color-text-dim)] hover:bg-white/10 hover:text-white"
            title="Export"
            aria-label="Export character"
          >
            <Download className="size-2.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="grid size-5 place-items-center rounded bg-red-500/10 text-red-300 hover:bg-red-500/20"
          title="Delete character"
          aria-label="Delete character"
        >
          <span className="text-[10px] font-bold">×</span>
        </button>
      </div>
    </div>
  );
}

export function CharacterListPanel({ onCreate, onDuplicate, onExport }: CharacterListPanelProps) {
  const characters = useCharacterStore((s) => s.characters);
  const activeCharacterId = useCharacterStore((s) => s.activeCharacterId);
  const setActiveCharacterId = useCharacterStore((s) => s.setActiveCharacterId);
  const deleteCharacter = useCharacterStore((s) => s.deleteCharacter);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "global" | "project">("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return characters.filter((c) => {
      if (scope === "global" && !c.isGlobal) return false;
      if (scope === "project" && c.isGlobal) return false;
      if (!q) return true;
      const haystack = [c.name, c.title ?? "", c.tagline, c.category ?? "", ...c.tags]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [characters, search, scope]);

  return (
    <aside className="flex w-[220px] min-w-[200px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Drama className="size-3.5 shrink-0 text-[var(--color-text-dim)]" />
          <span className="truncate text-[12px] font-medium text-[var(--color-text)]">
            Characters
          </span>
          <span className="shrink-0 rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-text-dim)]">
            {characters.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="grid size-6 shrink-0 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          title="New character"
          aria-label="New character"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-2 border-b border-[var(--color-border)] p-2.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-[var(--color-text-dim)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] py-1.5 pl-7 pr-2 text-[12px] text-white placeholder:text-[var(--color-text-dim)]/50 focus:border-[var(--color-accent)] focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1">
          {(["all", "global", "project"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`flex-1 rounded-md px-1.5 py-1 text-[10px] font-medium uppercase tracking-wide transition-colors ${
                scope === s
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-white"
              }`}
              title={s}
            >
              {s === "all" ? "All" : s === "global" ? "Glob" : "Proj"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-[12px] text-[var(--color-text-dim)]">
            {characters.length === 0 ? (
              <>
                <Users className="size-7 text-[var(--color-text-dim)]/40" />
                <p className="px-1">No characters yet.</p>
                <button
                  type="button"
                  onClick={onCreate}
                  className="rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-[11.5px] font-medium text-white hover:brightness-110"
                >
                  Create your first
                </button>
              </>
            ) : (
              <>
                <Search className="size-6 text-[var(--color-text-dim)]/40" />
                <p>No matches.</p>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filtered.map((c) => (
              <CharacterRow
                key={c.id}
                character={c}
                active={c.id === activeCharacterId}
                onSelect={() => setActiveCharacterId(c.id)}
                onDelete={() => setConfirmDeleteId(c.id)}
                onDuplicate={onDuplicate ? () => onDuplicate(c) : undefined}
                onExport={onExport ? () => onExport(c) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="flex w-[360px] max-w-[90vw] flex-col gap-3 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[13px] font-semibold text-white">Delete character?</h3>
            <p className="text-[12px] text-[var(--color-text-dim)]">
              This will permanently remove the character and its lorebook. Any conversations
              using it will lose their character binding but the chat history is kept.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-md px-3 py-1.5 text-[12.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = confirmDeleteId;
                  setConfirmDeleteId(null);
                  if (id) await deleteCharacter(id);
                }}
                className="rounded-md bg-red-500/80 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
