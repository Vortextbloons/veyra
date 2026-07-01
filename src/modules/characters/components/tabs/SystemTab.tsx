import type { CharacterRecord, CharacterChatDefaults } from "../../character-types";
import { DEFAULT_CHARACTER_CHAT_DEFAULTS } from "../../character-types";
import { FieldRow } from "./SharedUI";
import { WandField } from "./PersonaTab";

export function SystemTab({
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
