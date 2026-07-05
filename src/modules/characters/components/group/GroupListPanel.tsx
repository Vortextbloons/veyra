import { useState, useMemo } from "react";
import { Plus, Users } from "lucide-react";
import { useCharacterGroupStore } from "../../character-group-store";
import { useCharacterStore } from "../../character-store";
import { CharacterAvatar } from "../../CharacterAvatar";
import type { CharacterGroupRecord } from "../../character-group-types";
import type { CharacterRecord } from "../../character-types";
import { EmptyState } from "@/components/empty-state";

export function GroupListPanel({
  onCreate,
  onDelete,
}: {
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  const groups = useCharacterGroupStore((s) => s.groups);
  const activeGroupId = useCharacterGroupStore((s) => s.activeGroupId);
  const setActiveGroupId = useCharacterGroupStore((s) => s.setActiveGroupId);
  const characters = useCharacterStore((s) => s.characters);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "global" | "project">("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (scope === "global" && !g.isGlobal) return false;
      if (scope === "project" && g.isGlobal) return false;
      if (!q) return true;
      const haystack = [g.name, g.description, g.scenario, ...g.memberIds]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [groups, search, scope]);

  return (
    <aside className="flex w-[240px] min-w-[220px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Users className="size-3.5 shrink-0 text-[var(--color-text-dim)]" />
          <span className="truncate text-[12px] font-medium text-[var(--color-text)]">
            Groups
          </span>
          <span className="shrink-0 rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-text-dim)]">
            {groups.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="grid size-6 shrink-0 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          title="New group"
          aria-label="New group"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-2 border-b border-[var(--color-border)] p-2.5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12px] text-white placeholder:text-[var(--color-text-dim)]/50 focus:border-[var(--color-accent)] focus:outline-none"
        />
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
            >
              {s === "all" ? "All" : s === "global" ? "Glob" : "Proj"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          groups.length === 0 ? (
            <EmptyState
              icon={<Users className="size-7 text-[var(--color-text-dim)]/40" />}
              title="No groups yet."
              action={
                <button
                  type="button"
                  onClick={onCreate}
                  className="rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-[11.5px] font-medium text-white hover:brightness-110"
                >
                  Create your first
                </button>
              }
            />
          ) : (
            <EmptyState icon={<Users className="size-6 text-[var(--color-text-dim)]/40" />} title="No matches." />
          )
        ) : (
          <div className="flex flex-col gap-0.5">
            {filtered.map((g) => {
              const memberCharacters = g.memberIds
                .map((id) => characters.find((c) => c.id === id))
                .filter((c): c is CharacterRecord => Boolean(c));
              return (
                <GroupRow
                  key={g.id}
                  group={g}
                  members={memberCharacters}
                  active={g.id === activeGroupId}
                  onSelect={() => setActiveGroupId(g.id)}
                  onDelete={() => onDelete(g.id)}
                />
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

function GroupRow({
  group,
  members,
  active,
  onSelect,
  onDelete,
}: {
  group: CharacterGroupRecord;
  members: CharacterRecord[];
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const visible = members.slice(0, 4);
  const overflow = members.length - visible.length;
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
        <div className="flex -space-x-1.5">
          {visible.length === 0 ? (
            <div className="grid size-7 place-items-center rounded-full border border-dashed border-[var(--color-border)] text-[var(--color-text-dim)]">
              <Users className="size-3" />
            </div>
          ) : (
            visible.map((m) => (
              <div key={m.id} className="ring-2 ring-[var(--color-surface)] rounded-full">
                <CharacterAvatar character={m} size="sm" className="rounded-full" />
              </div>
            ))
          )}
          {overflow > 0 && (
            <div className="grid size-7 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] text-[10px] text-[var(--color-text-dim)] ring-2 ring-[var(--color-surface)]">
              +{overflow}
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12px] font-medium text-white">
              {group.name || "(untitled)"}
            </span>
            {!group.isGlobal && (
              <span className="shrink-0 rounded border border-[var(--color-border)] px-1 text-[9px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
                p
              </span>
            )}
          </div>
          <span className="truncate text-[10.5px] text-[var(--color-text-dim)]">
            {members.length} member{members.length === 1 ? "" : "s"} · {group.speakerMode}
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="absolute right-1 top-1 grid size-5 place-items-center rounded bg-red-500/10 text-red-300 opacity-0 transition-opacity hover:bg-red-500/20 group-hover:opacity-100"
        title="Delete group"
        aria-label="Delete group"
      >
        <span className="text-[10px] font-bold">×</span>
      </button>
    </div>
  );
}
