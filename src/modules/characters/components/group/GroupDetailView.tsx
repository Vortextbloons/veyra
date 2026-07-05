import { Users, MessageSquare, Edit3, Sparkles } from "lucide-react";
import { CharacterAvatar } from "../../CharacterAvatar";
import type { CharacterGroupRecord } from "../../character-group-types";
import type { CharacterRecord } from "../../character-types";

export function GroupDetailView({
  group,
  characters,
  onStartChat,
  onEdit,
}: {
  group: CharacterGroupRecord | null;
  characters: CharacterRecord[];
  onStartChat: () => void;
  onEdit: () => void;
}) {
  if (!group) return <GroupWelcome />;

  const members = group.memberIds
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is CharacterRecord => Boolean(c));
  const isSpeakerManual = group.speakerMode === "manual";

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500/30 to-violet-500/20 ring-1 ring-inset ring-indigo-400/30">
            <Users className="size-6 text-indigo-300" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[16px] font-semibold text-white">
                {group.name || "Untitled group"}
              </h2>
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  isSpeakerManual
                    ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-200"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                }`}
              >
                {group.speakerMode}
              </span>
              {!group.isGlobal && (
                <span className="rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-300">
                  Project
                </span>
              )}
            </div>
            {group.description && (
              <div className="mt-1 text-[12.5px] text-white/80">{group.description}</div>
            )}
            {group.scenario && (
              <div className="mt-1 text-[12px] text-[var(--color-text-dim)]">
                Scene: {group.scenario}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-3 text-[12.5px] font-medium text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
              >
                <Edit3 className="size-3.5" />
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={onStartChat}
              disabled={members.length === 0}
              className="flex h-9 items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 text-[12.5px] font-medium text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4)] hover:brightness-110 disabled:opacity-50"
            >
              <MessageSquare className="size-3.5" />
              Chat with {group.name || "group"}
            </button>
          </div>
        </div>
        {members.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-2 py-1"
              >
                <CharacterAvatar character={m} size="sm" className="rounded-full" />
                <span className="text-[11.5px] text-white">{m.name}</span>
              </div>
            ))}
          </div>
        )}
        {members.length === 0 && (
          <div className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-3 text-center text-[12px] text-[var(--color-text-dim)]">
            This group has no members. Edit the roster to add at least one character.
          </div>
        )}
      </div>
    </section>
  );
}

function GroupWelcome() {
  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
        <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
          <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/10 ring-1 ring-inset ring-indigo-400/30">
            <Users className="size-5 text-indigo-300" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-white">Groups</h2>
            <p className="mt-1.5 text-[12.5px] text-[var(--color-text-dim)]">
              Bundle characters into a roster and chat with them as a group.
              Pick a speaker manually or let the model choose.
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-[11.5px] text-[var(--color-text-dim)]">
            <span className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1">
              <Users className="size-3" /> Roster
            </span>
            <span className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1">
              <MessageSquare className="size-3" /> Shared lorebook
            </span>
            <span className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1">
              <Sparkles className="size-3" /> Auto or manual speaker
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
