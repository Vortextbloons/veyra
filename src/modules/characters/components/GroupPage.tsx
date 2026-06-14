import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Users,
  ArrowLeft,
  Edit3,
  MessageSquare,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { useCharacterGroupStore } from "../character-group-store";
import { useCharacterStore } from "../character-store";
import { newId, nowIso } from "@/lib/id";
import { CharacterAvatar } from "../CharacterAvatar";
import type { CharacterGroupRecord, CharacterGroupSpeakerMode } from "../character-group-types";
import type { CharacterRecord } from "../character-types";
import { GroupChatView } from "./GroupChatView";
import { startGroupChat } from "../group-chat";

export function GroupPage() {
  const hydrateGroups = useCharacterGroupStore((s) => s.hydrateGroups);
  const createGroup = useCharacterGroupStore((s) => s.createGroup);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    void hydrateGroups();
  }, [hydrateGroups]);

  const handleCreate = useCallback(async () => {
    const now = nowIso();
    const id = newId("group");
    await createGroup({
      id,
      name: "New group",
      memberIds: [],
      speakerMode: "auto" as CharacterGroupSpeakerMode,
      isGlobal: true,
      createdAt: now,
      updatedAt: now,
    });
  }, [createGroup]);

  return (
    <>
      <GroupPageContent
        onCreate={handleCreate}
        onDeleteGroup={(id) => setConfirmDeleteId(id)}
      />
      {confirmDeleteId && (
        <DeleteGroupModal
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={async () => {
            const id = confirmDeleteId;
            setConfirmDeleteId(null);
            if (id) await useCharacterGroupStore.getState().deleteGroup(id);
          }}
        />
      )}
    </>
  );
}

function DeleteGroupModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="flex w-[360px] max-w-[90vw] flex-col gap-3 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[13px] font-semibold text-white">Delete group?</h3>
        <p className="text-[12px] text-[var(--color-text-dim)]">
          This will permanently remove the group. Any conversations bound to it
          will keep their chat history but lose the persona/lorebook injection.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-red-500/80 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-red-500"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function GroupPageContent({
  onCreate,
  onDeleteGroup,
}: {
  onCreate: () => void;
  onDeleteGroup: (id: string) => void;
}) {
  const groups = useCharacterGroupStore((s) => s.groups);
  const hydrationState = useCharacterGroupStore((s) => s.hydrationState);
  const activeGroupId = useCharacterGroupStore((s) => s.activeGroupId);
  const characters = useCharacterStore((s) => s.characters);
  const [chatOpenRaw, setChatOpen] = useState(false);

  const activeGroup = useMemo(
    () => (activeGroupId ? groups.find((g) => g.id === activeGroupId) ?? null : null),
    [activeGroupId, groups],
  );
  const chatOpen = chatOpenRaw && !!activeGroup;

  // Close the editor if the active group disappears. The lint rule bans
  // sync setState in an effect, so we use the "previous value" pattern:
  // track the last id we saw and reset editor state when it changes.
  const [editorOpen, setEditorOpen] = useState(false);
  const [lastGroupId, setLastGroupId] = useState<string | null>(activeGroup?.id ?? null);
  if (lastGroupId !== (activeGroup?.id ?? null)) {
    setLastGroupId(activeGroup?.id ?? null);
    setEditorOpen(false);
  }

  const handleStartChat = useCallback(() => {
    if (!activeGroup) return;
    startGroupChat(activeGroup);
    setChatOpen(true);
  }, [activeGroup]);
  const handleBackFromChat = useCallback(() => setChatOpen(false), []);

  return (
    <div className="flex h-full min-w-0 flex-1 basis-0 flex-col bg-[var(--color-bg)]">
      <div className="flex flex-1 min-h-0">
        <GroupListPanel onCreate={onCreate} onDelete={onDeleteGroup} />
        {hydrationState === "ready" ? (
          chatOpen && activeGroup ? (
            <GroupChatView group={activeGroup} onBack={handleBackFromChat} />
          ) : (
            <GroupDetailView
              group={activeGroup}
              characters={characters}
              onStartChat={handleStartChat}
              onEdit={() => setEditorOpen(true)}
            />
          )
        ) : (
          <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--color-text-dim)]">
            Loading groups…
          </div>
        )}
      </div>

      {editorOpen && activeGroup && (
        <GroupEditorDrawer group={activeGroup} onClose={() => setEditorOpen(false)} />
      )}
    </div>
  );
}

export default GroupPage;

// ── List panel ──────────────────────────────────────────────────────────────

function GroupListPanel({
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
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-[12px] text-[var(--color-text-dim)]">
            {groups.length === 0 ? (
              <>
                <Users className="size-7 text-[var(--color-text-dim)]/40" />
                <p>No groups yet.</p>
                <button
                  type="button"
                  onClick={onCreate}
                  className="rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-[11.5px] font-medium text-white hover:brightness-110"
                >
                  Create your first
                </button>
              </>
            ) : (
              <p>No matches.</p>
            )}
          </div>
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

// ── Detail view ──────────────────────────────────────────────────────────────

function GroupDetailView({
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

// ── Editor drawer ────────────────────────────────────────────────────────────

function GroupEditorDrawer({
  group,
  onClose,
}: {
  group: CharacterGroupRecord;
  onClose: () => void;
}) {
  const updateGroup = useCharacterGroupStore((s) => s.updateGroup);
  const characters = useCharacterStore((s) => s.characters);
  const groups = useCharacterGroupStore((s) => s.groups);
  const liveGroup = groups.find((g) => g.id === group.id) ?? group;
  const [draft, setDraft] = useState<CharacterGroupRecord>(liveGroup);
  const [tab, setTab] = useState<"identity" | "roster" | "scene" | "meta">("identity");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The "previous value" pattern keeps the editor in sync when the
  // underlying record changes (e.g. after a save).
  const [lastSyncedId, setLastSyncedId] = useState(liveGroup.id);
  if (lastSyncedId !== liveGroup.id) {
    setLastSyncedId(liveGroup.id);
    setDraft(liveGroup);
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(liveGroup);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const now = nowIso();
      await updateGroup({
        id: draft.id,
        name: draft.name,
        description: draft.description,
        scenario: draft.scenario,
        memberIds: draft.memberIds,
        speakerMode: draft.speakerMode,
        openingMessage: draft.openingMessage,
        isGlobal: draft.isGlobal,
        projectId: draft.projectId,
        updatedAt: now,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const closeWithConfirm = () => {
    if (dirty) {
      const ok = window.confirm("Discard unsaved changes?");
      if (!ok) return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-sm"
      onClick={closeWithConfirm}
    >
      <div
        className="flex h-full w-[640px] max-w-[95vw] flex-col border-l border-[var(--color-border-strong)] bg-[var(--color-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-5">
          <div className="flex items-center gap-2.5">
            <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-500/20 ring-1 ring-inset ring-indigo-400/30">
              <Users className="size-3.5 text-indigo-300" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-white">Edit group</h2>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                {draft.name || "(unnamed)"} ·{" "}
                {dirty ? <span className="text-amber-300">unsaved changes</span> : "up to date"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeWithConfirm}
              className="rounded-md px-2.5 py-1.5 text-[12px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4)] hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={closeWithConfirm}
              className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
              aria-label="Close"
            >
              <ArrowLeft className="size-3.5" />
            </button>
          </div>
        </header>

        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4">
          {[
            { id: "identity", label: "Identity" },
            { id: "roster", label: "Roster" },
            { id: "scene", label: "Scene" },
            { id: "meta", label: "Metadata" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as never)}
              className={`rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                tab === t.id
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="border-b border-red-500/30 bg-red-500/10 px-5 py-2 text-[12px] text-red-300">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
          {tab === "identity" && (
            <IdentityTab draft={draft} setDraft={setDraft} />
          )}
          {tab === "roster" && (
            <RosterTab
              draft={draft}
              setDraft={setDraft}
              characters={characters}
            />
          )}
          {tab === "scene" && (
            <SceneTab draft={draft} setDraft={setDraft} />
          )}
          {tab === "meta" && (
            <MetaTab draft={draft} setDraft={setDraft} />
          )}
        </div>
      </div>
    </div>
  );
}

function IdentityTab({
  draft,
  setDraft,
}: {
  draft: CharacterGroupRecord;
  setDraft: (g: CharacterGroupRecord) => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Field label="Name" required>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
      </Field>
      <Field label="Description" hint="Short summary shown in the list.">
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          rows={2}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
      </Field>
      <Field
        label="Speaker mode"
        hint="Auto: the model picks. Manual: the user picks each turn."
      >
        <div className="grid grid-cols-2 gap-2">
          {(["auto", "manual"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setDraft({ ...draft, speakerMode: m })}
              className={`rounded-md border p-2.5 text-left text-[12px] transition-colors ${
                draft.speakerMode === m
                  ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-soft)] text-white"
                  : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
              }`}
            >
              <div className="text-[12.5px] font-medium capitalize text-white">{m}</div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                {m === "auto"
                  ? "Model picks the active speaker each turn."
                  : "You pick the active speaker from the chat header."}
              </div>
            </button>
          ))}
        </div>
      </Field>
      <Field label="Scope">
        <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-dim)]">
          <input
            type="checkbox"
            checked={draft.isGlobal}
            onChange={(e) => setDraft({ ...draft, isGlobal: e.target.checked })}
            className="size-3.5 rounded border-[var(--color-border)] bg-[var(--color-bg)] accent-[var(--color-accent)]"
          />
          <span>Global (available in every project)</span>
        </label>
      </Field>
    </div>
  );
}

function RosterTab({
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

function SceneTab({
  draft,
  setDraft,
}: {
  draft: CharacterGroupRecord;
  setDraft: (g: CharacterGroupRecord) => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Field label="Scene" hint="Default scene set on the system block.">
        <textarea
          value={draft.scenario}
          onChange={(e) => setDraft({ ...draft, scenario: e.target.value })}
          rows={4}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
      </Field>
      <Field
        label="Opening line"
        hint="Shown as the first assistant message when a new chat starts. Leave empty to fall back to the active speaker's greeting."
      >
        <textarea
          value={draft.openingMessage}
          onChange={(e) => setDraft({ ...draft, openingMessage: e.target.value })}
          rows={4}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
      </Field>
    </div>
  );
}

function MetaTab({
  draft,
}: {
  draft: CharacterGroupRecord;
  setDraft: (g: CharacterGroupRecord) => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Field label="Internal ids" hint="Internal references. Read-only.">
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-2 text-[11.5px] text-[var(--color-text-dim)]">
          <div>id: {draft.id}</div>
          <div>createdAt: {draft.createdAt}</div>
          <div>updatedAt: {draft.updatedAt}</div>
          <div>recentConversationIds: {draft.recentConversationIds.length} stored</div>
        </div>
      </Field>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
        {label}
        {required && <span className="ml-1 text-red-300">*</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-[var(--color-text-dim)]/80">{hint}</span>}
    </label>
  );
}
