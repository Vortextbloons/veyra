import type { CharacterRecord } from "../../character-types";
import { WandButton, StreamingPreview, type WandAction } from "../../ai-assist/WandButton";
import { useAssistJob, useAssistRunner, useCancelOnUnmount } from "../../ai-assist/use-assist-job";
import { useCharacterAssistStore } from "../../ai-assist/ai-assist-store";
import { useSettingsStore } from "@/stores/settings-store";
import { FieldRow, PendingChangeApplier } from "./SharedUI";

export function PersonaTab({
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

export function WandField({
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
        }}
        onApplyValue={(newValue) => onChange(newValue as string)}
      />
    </FieldRow>
  );
}
