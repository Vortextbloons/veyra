import { useMemo, useState } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { useCharacterGroupStore } from "../../character-group-store";
import { useCharacterStore } from "../../character-store";
import { nowIso } from "@/lib/id";
import type { CharacterGroupRecord } from "../../character-group-types";
import { RosterTab } from "./RosterTab";

export function GroupEditorDrawer({
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

  const [lastSyncedId, setLastSyncedId] = useState(liveGroup.id);
  if (lastSyncedId !== liveGroup.id) {
    setLastSyncedId(liveGroup.id);
    setDraft(liveGroup);
  }

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(liveGroup),
    [draft, liveGroup],
  );

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
