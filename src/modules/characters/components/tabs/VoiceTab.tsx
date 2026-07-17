import type { CharacterRecord } from "../../character-types";
import { WandButton, StreamingPreview } from "../../ai-assist/WandButton";
import { useAssistJob, useAssistRunner, useCancelOnUnmount } from "../../ai-assist/use-assist-job";
import { useCharacterAssistStore } from "../../ai-assist/ai-assist-store";
import { FieldRow } from "./SharedUI";
import { WandField } from "./PersonaTab";

export function VoiceTab({
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

  if (job.result) {
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
  let parsed: unknown;
  try {
    const trimmed = jobBuffer.trim().replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
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
