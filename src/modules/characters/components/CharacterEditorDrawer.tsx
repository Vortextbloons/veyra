import { useMemo, useState } from "react";
import {
  X,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type {
  CharacterAvatarColor,
  CharacterRecord,
} from "../character-types";
import { useCharacterStore } from "../character-store";
import { nowIso } from "@/lib/id";
import { AVATAR_GRADIENTS } from "../character-gradients";
import { useCharacterAssistStore, selectPendingChangesFor } from "../ai-assist/ai-assist-store";
import { LorebookEditor } from "./LorebookEditor";
import { IdentityTab } from "./tabs/IdentityTab";
import { PersonaTab } from "./tabs/PersonaTab";
import { VoiceTab } from "./tabs/VoiceTab";
import { SystemTab } from "./tabs/SystemTab";
import { MetadataTab } from "./tabs/MetadataTab";

export type EditorTabId = "identity" | "persona" | "voice" | "system" | "lorebook" | "metadata";

const TABS: { id: EditorTabId; label: string }[] = [
  { id: "identity", label: "Identity" },
  { id: "persona", label: "Persona" },
  { id: "voice", label: "Voice" },
  { id: "system", label: "System" },
  { id: "lorebook", label: "Lorebook" },
  { id: "metadata", label: "Metadata" },
];

interface CharacterEditorDrawerProps {
  character: CharacterRecord;
  open: boolean;
  onClose: () => void;
}

export function CharacterEditorDrawer({ character, open, onClose }: CharacterEditorDrawerProps) {
  if (!open) return null;
  return <DrawerBody character={character} onClose={onClose} />;
}

function DrawerBody({ character, onClose }: { character: CharacterRecord; onClose: () => void }) {
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);
  const characters = useCharacterStore((s) => s.characters);
  const liveCharacter = useMemo(
    () => characters.find((c) => c.id === character.id) ?? character,
    [characters, character],
  );
  const [tab, setTab] = useState<EditorTabId>("identity");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rawPendingChanges = useCharacterAssistStore((s) => s.pendingChanges);
  const pendingChanges = useMemo(
    () => selectPendingChangesFor(rawPendingChanges, liveCharacter.id),
    [rawPendingChanges, liveCharacter.id],
  );
  const clearPendingChangesFor = useCharacterAssistStore((s) => s.clearPendingChangesFor);

  const [draft, setDraft] = useState<CharacterRecord>(liveCharacter);
  const [lastSyncedId, setLastSyncedId] = useState(liveCharacter.id);
  const [lastSyncedUpdatedAt, setLastSyncedUpdatedAt] = useState(liveCharacter.updatedAt);
  if (lastSyncedId !== liveCharacter.id || lastSyncedUpdatedAt !== liveCharacter.updatedAt) {
    setLastSyncedId(liveCharacter.id);
    setLastSyncedUpdatedAt(liveCharacter.updatedAt);
    setDraft(liveCharacter);
  }

  const dirty = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify(liveCharacter);
  }, [draft, liveCharacter]);

  const closeWithConfirm = () => {
    if (dirty || pendingChanges.length > 0) {
      const ok = window.confirm(
        "Discard unsaved changes? Pending AI suggestions will also be discarded.",
      );
      if (!ok) return;
    }
    clearPendingChangesFor(liveCharacter.id);
    onClose();
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const now = nowIso();
      await updateCharacter({
        id: draft.id,
        name: draft.name,
        title: draft.title,
        avatarPath: draft.avatarPath,
        avatarColor: draft.avatarColor,
        tagline: draft.tagline,
        description: draft.description,
        personality: draft.personality,
        scenario: draft.scenario,
        firstMessage: draft.firstMessage,
        alternateGreetings: draft.alternateGreetings,
        systemPrompt: draft.systemPrompt,
        postHistoryInstructions: draft.postHistoryInstructions,
        exampleMessages: draft.exampleMessages,
        creatorNotes: draft.creatorNotes,
        tags: draft.tags,
        category: draft.category,
        version: draft.version,
        spec: draft.spec,
        creator: draft.creator,
        source: draft.source,
        isGlobal: draft.isGlobal,
        projectId: draft.projectId,
        lorebookEntries: draft.lorebookEntries,
        chatDefaults: draft.chatDefaults,
        updatedAt: now,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-sm"
      onClick={closeWithConfirm}
    >
      <div
        className="flex h-full w-[720px] max-w-[95vw] flex-col border-l border-[var(--color-border-strong)] bg-[var(--color-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-5">
          <div className="flex items-center gap-2.5">
            <div
              className={`grid size-7 place-items-center rounded-lg ${AVATAR_GRADIENTS[(draft.avatarColor as CharacterAvatarColor) ?? "indigo"]}`}
            >
              <span className="text-[11px] font-semibold text-white">
                {draft.name.trim().slice(0, 2).toUpperCase() || "??"}
              </span>
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-white">Edit character</h2>
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
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4)] hover:brightness-110 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : null}
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={closeWithConfirm}
              className="grid size-6 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
              aria-label="Close"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </header>

        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                tab === t.id
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
          {pendingChanges.length > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[10.5px] font-medium text-emerald-200">
              {pendingChanges.length} pending
            </span>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-5 py-2 text-[12px] text-red-300">
            <AlertCircle className="size-3.5" />
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
          {tab === "identity" && (
            <IdentityTab draft={draft} setDraft={setDraft} />
          )}
          {tab === "persona" && (
            <PersonaTab draft={draft} setDraft={setDraft} character={liveCharacter} />
          )}
          {tab === "voice" && (
            <VoiceTab draft={draft} setDraft={setDraft} character={liveCharacter} />
          )}
          {tab === "system" && (
            <SystemTab draft={draft} setDraft={setDraft} character={liveCharacter} />
          )}
          {tab === "lorebook" && (
            <LorebookEditor
              character={liveCharacter}
              draft={draft}
              setDraft={setDraft}
            />
          )}
          {tab === "metadata" && (
            <MetadataTab draft={draft} setDraft={setDraft} />
          )}
        </div>
      </div>
    </div>
  );
}
