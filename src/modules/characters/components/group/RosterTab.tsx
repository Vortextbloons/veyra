import { Plus, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { CharacterAvatar } from "../../CharacterAvatar";
import type { CharacterGroupRecord } from "../../character-group-types";
import type { CharacterRecord } from "../../character-types";

export function RosterTab({
  draft,
  setDraft,
  characters,
}: {
  draft: CharacterGroupRecord;
  setDraft: (g: CharacterGroupRecord) => void;
  characters: CharacterRecord[];
}) {
  const memberSet = new Set(draft.memberIds);
  const members = draft.memberIds
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is CharacterRecord => Boolean(c));
  const candidates = characters.filter((c) => !memberSet.has(c.id));

  const handleAdd = (id: string) => {
    setDraft({ ...draft, memberIds: [...draft.memberIds, id] });
  };
  const handleRemove = (id: string) => {
    setDraft({ ...draft, memberIds: draft.memberIds.filter((x) => x !== id) });
  };
  const handleMove = (id: string, dir: -1 | 1) => {
    const idx = draft.memberIds.indexOf(id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= draft.memberIds.length) return;
    const next = [...draft.memberIds];
    [next[idx], next[target]] = [next[target], next[idx]];
    setDraft({ ...draft, memberIds: next });
  };
  const handleSetActive = (id: string) => {
    setDraft({ ...draft, activeSpeakerId: id });
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <section>
        <h3 className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
          Members ({members.length})
        </h3>
        {members.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-3 text-center text-[12px] text-[var(--color-text-dim)]">
            No members yet. Add characters from the list below.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {members.map((m, idx) => {
              const isActive = m.id === draft.activeSpeakerId;
              return (
                <div
                  key={m.id}
                  className={`flex items-center gap-2 rounded-md border p-2 ${
                    isActive
                      ? "border-emerald-300/40 bg-emerald-300/[0.05]"
                      : "border-[var(--color-border)] bg-[var(--color-bg)]/40"
                  }`}
                >
                  <CharacterAvatar character={m} size="sm" className="rounded-full" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium text-white">
                      {m.name}
                    </div>
                    {m.title && (
                      <div className="truncate text-[10.5px] text-[var(--color-text-dim)]">
                        {m.title}
                      </div>
                    )}
                  </div>
                  {isActive && (
                    <span className="rounded border border-emerald-300/30 bg-emerald-300/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-200">
                      Default speaker
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleMove(m.id, -1)}
                    disabled={idx === 0}
                    className="rounded border border-[var(--color-border)] p-1 text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ChevronUp className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(m.id, 1)}
                    disabled={idx === members.length - 1}
                    className="rounded border border-[var(--color-border)] p-1 text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ChevronDown className="size-3" />
                  </button>
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => handleSetActive(m.id)}
                      className="rounded border border-emerald-300/30 bg-emerald-300/[0.06] px-1.5 py-0.5 text-[10.5px] text-emerald-200 hover:bg-emerald-300/10"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(m.id)}
                    className="rounded border border-red-400/30 bg-red-500/10 p-1 text-red-200 hover:bg-red-500/20"
                    aria-label="Remove"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
          Add characters ({candidates.length})
        </h3>
        {candidates.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-3 text-center text-[12px] text-[var(--color-text-dim)]">
            {characters.length === 0
              ? "No characters yet. Create one from the Characters page first."
              : "All available characters are already in this group."}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleAdd(c.id)}
                className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-1.5 text-left transition-colors hover:bg-white/5"
              >
                <CharacterAvatar character={c} size="sm" className="rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-white">{c.name}</div>
                  {c.title && (
                    <div className="truncate text-[10.5px] text-[var(--color-text-dim)]">
                      {c.title}
                    </div>
                  )}
                </div>
                <Plus className="size-3 text-[var(--color-text-dim)]" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
