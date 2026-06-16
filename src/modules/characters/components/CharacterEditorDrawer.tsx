import { useEffect, useMemo, useState } from "react";
import {
  X,
  Save,
  AlertCircle,
  Loader2,
  WandSparkles,
  Eye,
  User,
  MessageSquare,
  Sparkles,
  BookOpen,
  Info,
} from "lucide-react";
import type {
  CharacterAvatarColor,
  CharacterChatDefaults,
  CharacterRecord,
  CharacterSpec,
  CharacterSource,
} from "../character-types";
import { CHARACTER_AVATAR_COLORS, DEFAULT_CHARACTER_CHAT_DEFAULTS } from "../character-types";
import { useCharacterStore } from "../character-store";
import { nowIso } from "@/lib/id";
import { AVATAR_GRADIENTS } from "../character-gradients";
import { WandButton, StreamingPreview, SuggestionActions, type WandAction } from "../ai-assist/WandButton";
import { useAssistJob, useAssistRunner, useCancelOnUnmount } from "../ai-assist/use-assist-job";
import type { CharacterPendingChange } from "../ai-assist/ai-assist-types";
import { useCharacterAssistStore, selectPendingChangesFor } from "../ai-assist/ai-assist-store";
import { useSettingsStore } from "@/stores/settings-store";
import { LorebookEditor } from "./LorebookEditor";

export type EditorTabId = "identity" | "persona" | "voice" | "system" | "lorebook" | "metadata";

const TABS: { id: EditorTabId; label: string; icon: React.ReactNode }[] = [
  { id: "identity", label: "Identity", icon: <User className="size-3.5" /> },
  { id: "persona", label: "Persona", icon: <Eye className="size-3.5" /> },
  { id: "voice", label: "Voice", icon: <MessageSquare className="size-3.5" /> },
  { id: "system", label: "System", icon: <Sparkles className="size-3.5" /> },
  { id: "lorebook", label: "Lorebook", icon: <BookOpen className="size-3.5" /> },
  { id: "metadata", label: "Metadata", icon: <Info className="size-3.5" /> },
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

  // Sync local draft to the live character when the underlying record
  // changes (e.g. after save or when switching characters). We use the
  // "previous value" pattern: only update when the id actually changes.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [draft, setDraft] = useState<CharacterRecord>(liveCharacter);
  const [lastSyncedId, setLastSyncedId] = useState(liveCharacter.id);
  if (lastSyncedId !== liveCharacter.id) {
    setLastSyncedId(liveCharacter.id);
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
              {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
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
              {t.icon}
              {t.label}
            </button>
          ))}
          {pendingChanges.length > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[10.5px] font-medium text-emerald-200">
              <WandSparkles className="size-2.5" />
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

// ── Identity tab ────────────────────────────────────────────────────────────

function IdentityTab({
  draft,
  setDraft,
}: {
  draft: CharacterRecord;
  setDraft: (c: CharacterRecord) => void;
}) {
  const tone = useSettingsStore((s) => s.characterAssistTone);
  const runner = useAssistRunner();
  const job = useAssistJob(runner.jobId);
  useCancelOnUnmount(runner.jobId);
  const addPendingChange = useCharacterAssistStore((s) => s.addPendingChange);

  const fieldActions = (label: string, current: string, field: string): WandAction[] => {
    void current;
    void field;
    return [
    {
      id: "rewrite",
      label: "Rewrite",
      description: `Rephrase ${label.toLowerCase()} while preserving meaning.`,
      instruction: `Rewrite the ${label.toLowerCase()} of this character card. Preserve meaning.`,
    },
    {
      id: "expand",
      label: "Expand",
      description: `Add useful detail to ${label.toLowerCase()}.`,
      instruction: `Expand the ${label.toLowerCase()} with more detail in a ${tone} tone.`,
    },
    {
      id: "condense",
      label: "Condense",
      description: `Make ${label.toLowerCase()} more concise.`,
      instruction: `Make the ${label.toLowerCase()} more concise.`,
    },
  ];
  };

  const handleRun = (field: string, current: string, action: WandAction) => {
    const actionId = action.id as "rewrite" | "expand" | "condense";
    const jobId = runner.start(
      {
        action: actionId,
        characterId: draft.id,
        targetField: field,
        currentValue: current,
        options: { tone: tone as never },
      },
      { character: draft },
    );
    void jobId;
  };

  // Capture the latest result into a pending change.
  if (job.result && job.result.card) {
    const card = job.result.card;
    const key = Object.keys(card)[0];
    if (key) {
      const value = (card as Record<string, unknown>)[key];
      if (typeof value === "string") {
        const change: Omit<CharacterPendingChange, "id" | "createdAt" | "status"> = {
          characterId: draft.id,
          field: key,
          label: key,
          before: (draft as unknown as Record<string, unknown>)[key],
          after: value,
          source: "rewrite",
        };
        addPendingChange(change);
      }
    }
    // Clear so we don't re-add on re-render.
    job.clear();
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Name" required>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
          />
        </FieldRow>
        <FieldRow label="Title">
          <input
            type="text"
            value={draft.title ?? ""}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
          />
        </FieldRow>
      </div>
      <FieldRow label="Tagline" hint="One-line summary shown in the list.">
        <div className="flex items-start gap-2">
          <input
            type="text"
            value={draft.tagline}
            onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
            className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
          />
          <WandButton
            actions={fieldActions("Tagline", draft.tagline, "tagline")}
            onAction={(a) => handleRun("tagline", draft.tagline, a)}
            busy={job.running}
          />
        </div>
        <StreamingPreview buffer={job.buffer} busy={job.running} onCancel={runner.cancel} hint="Rewriting tagline…" />
        <PendingChangeApplier field="tagline" draft={draft} setDraft={setDraft} label="Tagline" />
      </FieldRow>

      <FieldRow label="Version">
        <input
          type="text"
          value={draft.version}
          onChange={(e) => setDraft({ ...draft, version: e.target.value })}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
      </FieldRow>
      <FieldRow label="Category">
        <input
          type="text"
          value={draft.category ?? ""}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
      </FieldRow>
      <FieldRow label="Creator">
        <input
          type="text"
          value={draft.creator}
          onChange={(e) => setDraft({ ...draft, creator: e.target.value })}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
      </FieldRow>

      <FieldRow label="Tags">
        <TagEditor
          tags={draft.tags}
          onChange={(tags) => setDraft({ ...draft, tags })}
          character={draft}
        />
      </FieldRow>

      <AvatarField draft={draft} setDraft={setDraft} />

      <FieldRow label="Scope">
        <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-dim)]">
          <input
            type="checkbox"
            checked={draft.isGlobal}
            onChange={(e) => setDraft({ ...draft, isGlobal: e.target.checked })}
            className="size-3.5 rounded border-[var(--color-border)] bg-[var(--color-bg)] accent-[var(--color-accent)]"
          />
          <span>Global (available in every project)</span>
        </label>
      </FieldRow>
    </div>
  );
}

function TagEditor({
  tags,
  onChange,
  character,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  character: CharacterRecord;
}) {
  const [input, setInput] = useState("");
  const runner = useAssistRunner();
  const job = useAssistJob(runner.jobId);
  useCancelOnUnmount(runner.jobId);
  const addPendingChange = useCharacterAssistStore((s) => s.addPendingChange);
  const tone = useSettingsStore((s) => s.characterAssistTone);

  const handleAdd = () => {
    const value = input.trim().toLowerCase();
    if (!value) return;
    if (tags.includes(value)) {
      setInput("");
      return;
    }
    onChange([...tags, value]);
    setInput("");
  };

  const handleRemove = (t: string) => {
    onChange(tags.filter((x) => x !== t));
  };

  const handleSuggest = () => {
    runner.start(
      {
        action: "suggest_tags",
        characterId: character.id,
        options: { tone: tone as never },
      },
      { character },
    );
  };

  if (job.result && job.result.card) {
    const suggested = (job.result.card.tags as unknown as string[] | undefined) ?? [];
    if (suggested.length > 0) {
      const merged = Array.from(new Set([...tags, ...suggested.map((s) => s.toLowerCase())]));
      addPendingChange({
        characterId: character.id,
        field: "tags",
        label: "Tags",
        before: tags,
        after: merged,
        source: "suggest_tags",
      });
    }
    job.clear();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/60 px-2 py-0.5 text-[11.5px] text-white"
          >
            {t}
            <button
              type="button"
              onClick={() => handleRemove(t)}
              className="text-[var(--color-text-dim)] hover:text-white"
              aria-label={`Remove ${t}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Add a tag and press Enter"
          className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        >
          Add
        </button>
        <WandButton
          actions={[
            {
              id: "suggest",
              label: "Suggest tags",
              description: "Generate tags from the character summary.",
              instruction: "Suggest tags.",
            },
          ]}
          onAction={handleSuggest}
          busy={job.running}
        />
      </div>
      <StreamingPreview buffer={job.buffer} busy={job.running} onCancel={runner.cancel} hint="Suggesting tags…" />
      <PendingChangeApplier field="tags" draft={character} setDraft={(updated) => {
        void updated;
        // Use the latest character for "before" context; the actual apply
        // happens via the PendingChangeApplier which knows the change.
        // This dummy setter keeps TS happy and the applier uses the store.
      }} label="Tags" />
    </div>
  );
}

// ── Persona tab ────────────────────────────────────────────────────────────

function PersonaTab({
  draft,
  setDraft,
  character,
}: {
  draft: CharacterRecord;
  setDraft: (c: CharacterRecord) => void;
  character: CharacterRecord;
}) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <WandField
        character={character}
        field="description"
        label="Description"
        rows={8}
        value={draft.description}
        onChange={(v) => setDraft({ ...draft, description: v })}
        hint="Long-form biography. Markdown is allowed."
      />
      <WandField
        character={character}
        field="personality"
        label="Personality"
        rows={5}
        value={draft.personality}
        onChange={(v) => setDraft({ ...draft, personality: v })}
      />
      <WandField
        character={character}
        field="scenario"
        label="Scenario"
        rows={4}
        value={draft.scenario}
        onChange={(v) => setDraft({ ...draft, scenario: v })}
        hint="Default scene. Used as the opening context."
      />
      <FieldRow label="Creator notes">
        <textarea
          value={draft.creatorNotes}
          onChange={(e) => setDraft({ ...draft, creatorNotes: e.target.value })}
          rows={3}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
      </FieldRow>
    </div>
  );
}

function WandField({
  character,
  field,
  label,
  value,
  onChange,
  rows = 4,
  hint,
}: {
  character: CharacterRecord;
  field: string;
  label: string;
  value: string;
  onChange: (s: string) => void;
  rows?: number;
  hint?: string;
}) {
  const runner = useAssistRunner();
  const job = useAssistJob(runner.jobId);
  useCancelOnUnmount(runner.jobId);
  const addPendingChange = useCharacterAssistStore((s) => s.addPendingChange);
  const tone = useSettingsStore((s) => s.characterAssistTone);

  const actions: WandAction[] = [
    {
      id: "rewrite",
      label: "Rewrite",
      description: `Rephrase ${label.toLowerCase()} while preserving meaning.`,
      instruction: `Rewrite the ${label.toLowerCase()} of this character. Preserve meaning.`,
    },
    {
      id: "expand",
      label: "Expand",
      description: `Add useful detail in a ${tone} tone.`,
      instruction: `Expand the ${label.toLowerCase()} with detail.`,
    },
    {
      id: "condense",
      label: "Condense",
      description: `Cut filler.`,
      instruction: `Make the ${label.toLowerCase()} more concise.`,
    },
    {
      id: "evocative",
      label: "Make evocative",
      description: "Sharpen sensory detail and voice.",
      instruction: `Make the ${label.toLowerCase()} more evocative and atmospheric.`,
    },
  ];

  const handleRun = (action: WandAction) => {
    const actionId = action.id as "rewrite" | "expand" | "condense";
    runner.start(
      {
        action: actionId,
        characterId: character.id,
        targetField: field,
        currentValue: value,
        options: { tone: tone as never },
      },
      { character },
    );
  };

  if (job.result && job.result.card) {
    const newValue = (job.result.card as Record<string, unknown>)[field];
    if (typeof newValue === "string" && newValue !== value) {
      addPendingChange({
        characterId: character.id,
        field,
        label,
        before: value,
        after: newValue,
        source: "rewrite",
      });
    }
    job.clear();
  }

  return (
    <FieldRow label={label} hint={hint}>
      <div className="flex items-start gap-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
        <WandButton actions={actions} onAction={handleRun} busy={job.running} />
      </div>
      <StreamingPreview buffer={job.buffer} busy={job.running} onCancel={runner.cancel} hint={`${label}…`} />
      <PendingChangeApplier
        field={field}
        label={label}
        draft={character}
        setDraft={(c) => {
          void c;
          // We pass through to the prop callback via the applier's apply button.
        }}
        onApplyValue={(newValue) => onChange(newValue as string)}
      />
    </FieldRow>
  );
}

// ── Voice tab ───────────────────────────────────────────────────────────────

function VoiceTab({
  draft,
  setDraft,
  character,
}: {
  draft: CharacterRecord;
  setDraft: (c: CharacterRecord) => void;
  character: CharacterRecord;
}) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <WandField
        character={character}
        field="firstMessage"
        label="First message"
        rows={5}
        value={draft.firstMessage}
        onChange={(v) => setDraft({ ...draft, firstMessage: v })}
        hint="Opening line shown when starting a new chat."
      />
      <GreetingsEditor
        character={character}
        greetings={draft.alternateGreetings}
        onChange={(g) => setDraft({ ...draft, alternateGreetings: g })}
      />
      <ExamplesEditor
        character={character}
        examples={draft.exampleMessages}
        onChange={(e) => setDraft({ ...draft, exampleMessages: e })}
      />
    </div>
  );
}

function GreetingsEditor({
  character,
  greetings,
  onChange,
}: {
  character: CharacterRecord;
  greetings: string[];
  onChange: (g: string[]) => void;
}) {
  const runner = useAssistRunner();
  const job = useAssistJob(runner.jobId);
  useCancelOnUnmount(runner.jobId);
  const addPendingChange = useCharacterAssistStore((s) => s.addPendingChange);

  const handleSuggest = () => {
    runner.start(
      { action: "suggest_greetings", characterId: character.id, options: { count: 3 } },
      { character },
    );
  };

  if (job.result && job.result.warnings?.includes("refusal")) {
    // Soft message already shown in buffer.
    job.clear();
  }

  if (job.result && !job.result.warnings?.includes("refusal")) {
    // We didn't get a structured array, but the raw text is in buffer.
    // Just clear; the streaming preview is the artifact.
    job.clear();
  }

  return (
    <FieldRow
      label="Alternate greetings"
      hint={`${greetings.length} greeting${greetings.length === 1 ? "" : "s"}. Used as random alternates when starting a chat.`}
    >
      <div className="flex flex-col gap-2">
        {greetings.map((g, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <span className="mt-1.5 shrink-0 rounded bg-[var(--color-bg)] px-1.5 text-[10.5px] text-[var(--color-text-dim)]">
              #{idx + 1}
            </span>
            <textarea
              value={g}
              onChange={(e) => {
                const next = [...greetings];
                next[idx] = e.target.value;
                onChange(next);
              }}
              rows={3}
              className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => onChange(greetings.filter((_, i) => i !== idx))}
              className="mt-1.5 rounded border border-[var(--color-border)] px-2 py-1 text-[10.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            >
              Remove
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange([...greetings, ""])}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            + Add greeting
          </button>
          <WandButton
            actions={[
              {
                id: "suggest",
                label: "Suggest 3 greetings",
                description: "Generate three alternate opening lines in different tones.",
                instruction: "Suggest 3 alternate greetings.",
              },
              {
                id: "suggest-5",
                label: "Suggest 5 greetings",
                description: "Generate five variations.",
                instruction: "Suggest 5 alternate greetings.",
              },
            ]}
            onAction={handleSuggest}
            busy={job.running}
          />
        </div>
        <StreamingPreview buffer={job.buffer} busy={job.running} onCancel={runner.cancel} hint="Suggesting greetings…" />
        <SuggestionCatcher
          jobBuffer={job.buffer}
          onAccept={(parsed) => {
            const list = Array.isArray((parsed as { greetings?: unknown }).greetings)
              ? ((parsed as { greetings: unknown[] }).greetings.filter((g) => typeof g === "string") as string[])
              : [];
            if (list.length === 0) return;
            const merged = [...greetings, ...list];
            addPendingChange({
              characterId: character.id,
              field: "alternateGreetings",
              label: "Alternate greetings",
              before: greetings,
              after: merged,
              source: "suggest_greetings",
            });
            onChange(merged);
          }}
        />
      </div>
    </FieldRow>
  );
}

function ExamplesEditor({
  character,
  examples,
  onChange,
}: {
  character: CharacterRecord;
  examples: { user: string; assistant: string }[];
  onChange: (e: { user: string; assistant: string }[]) => void;
}) {
  const runner = useAssistRunner();
  const job = useAssistJob(runner.jobId);
  useCancelOnUnmount(runner.jobId);
  const addPendingChange = useCharacterAssistStore((s) => s.addPendingChange);

  const handleSuggest = () => {
    runner.start(
      { action: "suggest_examples", characterId: character.id, options: { count: 2 } },
      { character },
    );
  };

  return (
    <FieldRow label="Example dialogues" hint="Few-shot examples that demonstrate the character's voice.">
      <div className="flex flex-col gap-2">
        {examples.map((ex, idx) => (
          <div key={idx} className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10.5px] uppercase tracking-wide text-[var(--color-text-dim)]">
                Example #{idx + 1}
              </span>
              <button
                type="button"
                onClick={() => onChange(examples.filter((_, i) => i !== idx))}
                className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[10.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
              >
                Remove
              </button>
            </div>
            <label className="mb-1.5 flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
                User
              </span>
              <textarea
                value={ex.user}
                onChange={(e) => {
                  const next = [...examples];
                  next[idx] = { ...next[idx], user: e.target.value };
                  onChange(next);
                }}
                rows={2}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
                Assistant
              </span>
              <textarea
                value={ex.assistant}
                onChange={(e) => {
                  const next = [...examples];
                  next[idx] = { ...next[idx], assistant: e.target.value };
                  onChange(next);
                }}
                rows={2}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange([...examples, { user: "", assistant: "" }])}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            + Add pair
          </button>
          <WandButton
            actions={[
              {
                id: "suggest",
                label: "Generate from persona",
                description: "Create 2 example pairs that match the character.",
                instruction: "Generate 2 example dialogue pairs.",
              },
            ]}
            onAction={handleSuggest}
            busy={job.running}
          />
        </div>
        <StreamingPreview buffer={job.buffer} busy={job.running} onCancel={runner.cancel} hint="Generating examples…" />
        <SuggestionCatcher
          jobBuffer={job.buffer}
          onAccept={(parsed) => {
            const list = Array.isArray((parsed as { examples?: unknown }).examples)
              ? ((parsed as { examples: unknown[] }).examples as { user: string; assistant: string }[])
              : [];
            if (list.length === 0) return;
            const merged = [...examples, ...list];
            addPendingChange({
              characterId: character.id,
              field: "exampleMessages",
              label: "Example dialogues",
              before: examples,
              after: merged,
              source: "suggest_examples",
            });
            onChange(merged);
          }}
        />
      </div>
    </FieldRow>
  );
}

function SuggestionCatcher({
  jobBuffer,
  onAccept,
}: {
  jobBuffer: string;
  onAccept: (parsed: unknown) => void;
}) {
  if (!jobBuffer) return null;
  // Try to parse the buffer; if we get a JSON object, render the accept UI.
  // We extract the parse step into a helper to keep JSX out of the try/catch.
  const parsed = tryParseSuggestionBuffer(jobBuffer);
  if (!parsed) return null;
  return (
    <div className="rounded-md border border-emerald-300/20 bg-emerald-300/[0.04] p-2">
      <p className="text-[11px] text-emerald-200/80">Parsed suggestion available.</p>
      <button
        type="button"
        onClick={() => onAccept(parsed)}
        className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-500/85 px-2.5 py-1 text-[11.5px] font-medium text-white"
        >
          Accept
        </button>
      </div>
    );
}

// ── System tab ──────────────────────────────────────────────────────────────

function SystemTab({
  draft,
  setDraft,
  character,
}: {
  draft: CharacterRecord;
  setDraft: (c: CharacterRecord) => void;
  character: CharacterRecord;
}) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <WandField
        character={character}
        field="systemPrompt"
        label="System prompt override"
        rows={6}
        value={draft.systemPrompt}
        onChange={(v) => setDraft({ ...draft, systemPrompt: v })}
        hint="Rendered as <veyra_character_system>. Empty falls back to the global default."
      />
      <WandField
        character={character}
        field="postHistoryInstructions"
        label="Post-history instructions"
        rows={4}
        value={draft.postHistoryInstructions ?? ""}
        onChange={(v) => setDraft({ ...draft, postHistoryInstructions: v })}
        hint="Rendered at the end of the system prompt, after the message history."
      />

      <FieldRow
        label="Chat defaults"
        hint="Per-character runtime settings. Affects lorebook triggers and example injection."
      >
        <ChatDefaultsEditor
          value={draft.chatDefaults ?? DEFAULT_CHARACTER_CHAT_DEFAULTS}
          onChange={(v) => setDraft({ ...draft, chatDefaults: v })}
        />
      </FieldRow>
    </div>
  );
}

function ChatDefaultsEditor({
  value,
  onChange,
}: {
  value: CharacterChatDefaults;
  onChange: (v: CharacterChatDefaults) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
          Scan depth
        </span>
        <input
          type="number"
          min={1}
          max={50}
          value={value.scanDepth}
          onChange={(e) => onChange({ ...value, scanDepth: Math.max(1, Number(e.target.value) || 1) })}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
          Max lorebook entries
        </span>
        <input
          type="number"
          min={1}
          max={20}
          value={value.maxLorebookEntries}
          onChange={(e) => onChange({ ...value, maxLorebookEntries: Math.max(1, Number(e.target.value) || 1) })}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
      </label>
      <label className="col-span-2 flex items-center gap-2 text-[12px] text-[var(--color-text-dim)]">
        <input
          type="checkbox"
          checked={value.includeExamples}
          onChange={(e) => onChange({ ...value, includeExamples: e.target.checked })}
          className="size-3.5 rounded border-[var(--color-border)] bg-[var(--color-bg)] accent-[var(--color-accent)]"
        />
        Inject example dialogues as few-shot.
      </label>
      <label className="col-span-2 flex items-center gap-2 text-[12px] text-[var(--color-text-dim)]">
        <input
          type="checkbox"
          checked={value.allowDocumentTools}
          onChange={(e) => onChange({ ...value, allowDocumentTools: e.target.checked })}
          className="size-3.5 rounded border-[var(--color-border)] bg-[var(--color-bg)] accent-[var(--color-accent)]"
        />
        Allow document AI tools in character chat.
      </label>
    </div>
  );
}

// ── Metadata tab ────────────────────────────────────────────────────────────

function MetadataTab({
  draft,
  setDraft,
}: {
  draft: CharacterRecord;
  setDraft: (c: CharacterRecord) => void;
}) {
  const setSpec = (spec: CharacterSpec) => setDraft({ ...draft, spec });
  const setSource = (source: CharacterSource) => setDraft({ ...draft, source });
  return (
    <div className="flex flex-col gap-4 p-6">
      <FieldRow label="Spec" hint="Origin format. Affects the badge shown on the detail view.">
        <select
          value={draft.spec}
          onChange={(e) => setSpec(e.target.value as CharacterSpec)}
          className="w-48 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        >
          <option value="veyra">Veyra</option>
          <option value="chara_card_v3">Character Card V3</option>
        </select>
      </FieldRow>
      <FieldRow label="Source" hint="How the card was created. Set automatically on import.">
        <select
          value={draft.source}
          onChange={(e) => setSource(e.target.value as CharacterSource)}
          className="w-48 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        >
          <option value="native">Native</option>
          <option value="imported_ccv3">Imported (CCv3)</option>
          <option value="duplicate">Duplicate</option>
        </select>
      </FieldRow>
      <FieldRow label="Stats" hint="Computed from conversation history.">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Total chats" value={String(draft.stats?.totalChats ?? 0)} />
          <Stat label="Total messages" value={String(draft.stats?.totalMessages ?? 0)} />
          <Stat
            label="Last used"
            value={
              draft.stats?.lastUsedAt
                ? new Date(draft.stats.lastUsedAt).toLocaleString()
                : "—"
            }
          />
        </div>
      </FieldRow>
      <FieldRow label="Creator metadata" hint="Free-form JSON. CCv3 extension data is stored here.">
        <textarea
          value={JSON.stringify(draft.creatorMetadata ?? {}, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              setDraft({ ...draft, creatorMetadata: parsed });
            } catch {
              // ignore parse errors while typing
            }
          }}
          rows={6}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 font-mono text-[11.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
      </FieldRow>
      <FieldRow label="Internal ids" hint="Internal references. Read-only.">
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-2 text-[11.5px] text-[var(--color-text-dim)]">
          <div>id: {draft.id}</div>
          <div>createdAt: {draft.createdAt}</div>
          <div>updatedAt: {draft.updatedAt}</div>
        </div>
      </FieldRow>
    </div>
  );
}

function tryParseSuggestionBuffer(buffer: string): unknown | null {
  try {
    const trimmed = buffer.trim().replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[12.5px] text-white">{value}</div>
    </div>
  );
}

// ── Shared field row ───────────────────────────────────────────────────────

function FieldRow({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
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

// ── Avatar picker ───────────────────────────────────────────────────────────

function AvatarField({
  draft,
  setDraft,
}: {
  draft: CharacterRecord;
  setDraft: (c: CharacterRecord) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!draft.avatarPath) return;
    import("../character-avatar").then(({ ensureCharacterAvatarUrl }) =>
      ensureCharacterAvatarUrl(draft.avatarPath).then((u) => {
        if (!cancelled) setAvatarUrl(u);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [draft.avatarPath]);

  const handlePick = async () => {
    setError(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        multiple: false,
        directory: false,
        filters: [
          { name: "Image", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
        ],
      });
      if (!path || typeof path !== "string") return;
      setBusy(true);
      const { invoke } = await import("@tauri-apps/api/core");
      const { filePathToUrl } = await import("../character-avatar");
      const url = filePathToUrl(path);
      setPreviewUrl(url);
      const bytes = await invoke<number[]>("read_binary_file", { path });
      const u8 = new Uint8Array(bytes);
      const { saveCharacterAvatar } = await import("../character-avatar");
      const relative = await saveCharacterAvatar(draft.id, u8);
      setDraft({ ...draft, avatarPath: relative });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (!draft.avatarPath) return;
    try {
      const { deleteCharacterAvatar } = await import("../character-avatar");
      await deleteCharacterAvatar(draft.avatarPath);
      setDraft({ ...draft, avatarPath: undefined });
      setPreviewUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
        Avatar
      </span>
      <div className="flex items-start gap-3">
        <div className="size-20 shrink-0 overflow-hidden rounded-2xl ring-1 ring-inset ring-white/10">
          {avatarUrl || previewUrl ? (
            <img
              src={avatarUrl ?? previewUrl ?? ""}
              alt="Avatar preview"
              className="size-full object-cover"
            />
          ) : (
            <div
              className={`size-full ${AVATAR_GRADIENTS[(draft.avatarColor as CharacterAvatarColor) ?? "indigo"]}`}
            />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {CHARACTER_AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDraft({ ...draft, avatarColor: c })}
                className={`size-6 rounded ${AVATAR_GRADIENTS[c]} transition-transform hover:scale-110 ${
                  c === draft.avatarColor
                    ? "ring-2 ring-white"
                    : "ring-1 ring-inset ring-white/10"
                }`}
                aria-label={c}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePick}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              {busy ? "Uploading…" : draft.avatarPath ? "Replace image" : "Upload image"}
            </button>
            {draft.avatarPath && (
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-400/30 bg-red-500/10 px-2.5 py-1.5 text-[11.5px] text-red-200 hover:bg-red-500/20"
              >
                Remove image
              </button>
            )}
            <span className="text-[10.5px] text-[var(--color-text-dim)]">
              PNG, JPEG, GIF, or WebP. Max 4 MB.
            </span>
          </div>
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11.5px] text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pending change applier ─────────────────────────────────────────────────

function PendingChangeApplier({
  field,
  label,
  draft,
  setDraft,
  onApplyValue,
}: {
  field: string;
  label: string;
  draft: CharacterRecord;
  setDraft: (c: CharacterRecord) => void;
  onApplyValue?: (v: unknown) => void;
}) {
  const rawPendingChanges = useCharacterAssistStore((s) => s.pendingChanges);
  const pendingChanges = useMemo(
    () =>
      selectPendingChangesFor(rawPendingChanges, draft.id).filter((c) => c.field === field),
    [rawPendingChanges, draft.id, field],
  );
  const discardPendingChange = useCharacterAssistStore((s) => s.discardPendingChange);
  const markPendingChangeApplied = useCharacterAssistStore((s) => s.markPendingChangeApplied);

  if (pendingChanges.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {pendingChanges.map((change) => (
        <div
          key={change.id}
          className="rounded-md border border-emerald-300/25 bg-emerald-300/[0.04] p-2"
        >
          <div className="mb-1 flex items-center justify-between text-[10.5px] uppercase tracking-wide text-emerald-200/80">
            <span>AI suggestion · {label}</span>
          </div>
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap text-[12px] text-white/85">
            {typeof change.after === "string"
              ? change.after
              : JSON.stringify(change.after, null, 2)}
          </pre>
          <SuggestionActions
            onApply={() => {
              if (onApplyValue) {
                onApplyValue(change.after);
              } else {
                setDraft({ ...draft, [field]: change.after } as CharacterRecord);
              }
              markPendingChangeApplied(change.id);
            }}
            onReroll={() => {
              discardPendingChange(change.id);
            }}
            onDiscard={() => {
              discardPendingChange(change.id);
            }}
          />
        </div>
      ))}
    </div>
  );
}
