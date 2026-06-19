import { useState } from "react";
import { Drama, X, WandSparkles, Loader2, ChevronRight } from "lucide-react";
import { useCharacterStore } from "../character-store";
import { CHARACTER_AVATAR_COLORS } from "../character-types";
import type { CharacterAvatarColor } from "../character-types";
import type { CharacterRecord } from "../character-types";
import { AVATAR_GRADIENTS } from "../character-gradients";
import { newId } from "@/lib/id";
import { useAssistJob, useAssistRunner } from "../ai-assist/use-assist-job";
import {
  StreamingPreview,
  SuggestionActions,
} from "../ai-assist/WandButton";
import { CHARACTER_TONE_PRESETS } from "../ai-assist/tones";
import { useSettingsStore } from "@/stores/settings-store";
import { DialogSurface } from "@/components/dialog-surface";

interface NewCharacterDialogProps {
  open: boolean;
  onClose: () => void;
}

type Mode = "manual" | "concept";

interface GeneratedDraft {
  name: string;
  title: string;
  tagline: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  alternateGreetings: string[];
  systemPrompt: string;
  postHistoryInstructions: string;
  exampleMessages: { user: string; assistant: string }[];
  creatorNotes: string;
  tags: string[];
  category: string;
  version: string;
  lorebookEntries: Array<{
    keys: string[];
    content: string;
    comment?: string;
    priority: number;
  }>;
}

export function NewCharacterDialog({ open, onClose }: NewCharacterDialogProps) {
  // Only mount the form body while `open` is true. This unmounts on close,
  // so the next time the dialog opens, all local state (name, title, etc.)
  // is re-initialized fresh by useState — no effects needed.
  if (!open) return null;
  return <DialogBody onClose={onClose} />;
}

function DialogBody({ onClose }: { onClose: () => void }) {
  const createCharacter = useCharacterStore((s) => s.createCharacter);
  const [mode, setMode] = useState<Mode>("manual");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [color, setColor] = useState<CharacterAvatarColor>("indigo");
  const [isGlobal, setIsGlobal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [concept, setConcept] = useState("");
  const [tone, setTone] = useState<string>(useSettingsStore.getState().characterAssistTone);
  const [draft, setDraft] = useState<GeneratedDraft | null>(null);
  const runner = useAssistRunner();
  const job = useAssistJob(runner.jobId);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      await createCharacter({
        name: trimmed,
        title: title.trim() || undefined,
        tagline: tagline.trim(),
        avatarColor: color,
        isGlobal,
        createdAt: now,
        updatedAt: now,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!draft) return;
    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      setError("Draft has no name. Edit the name field first or regenerate.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const id = newId("char");
      const lorebookEntries = draft.lorebookEntries.map((e, idx) => ({
        id: newId("lbe"),
        characterId: id,
        keys: e.keys,
        content: e.content,
        constant: false,
        selective: false,
        insertionOrder: idx,
        priority: Math.max(1, Math.min(5, e.priority)) as 1 | 2 | 3 | 4 | 5,
        enabled: true,
        matchType: "any" as const,
        caseSensitive: false,
        scope: "character" as const,
        comment: e.comment,
        position: "before" as const,
        probability: 100,
        createdAt: now,
        updatedAt: now,
      }));
      await createCharacter({
        id,
        name: trimmedName,
        title: draft.title || undefined,
        avatarColor: color,
        tagline: draft.tagline,
        description: draft.description,
        personality: draft.personality,
        scenario: draft.scenario,
        firstMessage: draft.firstMessage,
        alternateGreetings: draft.alternateGreetings,
        systemPrompt: draft.systemPrompt,
        postHistoryInstructions: draft.postHistoryInstructions || undefined,
        exampleMessages: draft.exampleMessages,
        creatorNotes: draft.creatorNotes,
        tags: draft.tags,
        category: draft.category || undefined,
        version: draft.version || "1.0.0",
        spec: "veyra",
        source: "native",
        isGlobal,
        lorebookEntries,
        creatorMetadata: { aiAssisted: true, aiAssistedAt: now },
        createdAt: now,
        updatedAt: now,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const generate = () => {
    if (!concept.trim()) return;
    setError(null);
    setDraft(null);
    const toneMeta = CHARACTER_TONE_PRESETS.find((t) => t.id === tone);
    runner.start(
      {
        action: "generate",
        concept: concept.trim(),
        options: {
          tone: toneMeta?.id as never,
          customToneInstruction: tone === "custom" ? "" : undefined,
        },
      },
      { userPrompt: concept.trim() },
    );
  };

  // Capture job result into the local draft.
  if (job.result && !draft) {
    const card = (job.result.card ?? {}) as Partial<CharacterRecord>;
    setDraft({
      name: card.name ?? "",
      title: card.title ?? "",
      tagline: card.tagline ?? "",
      description: card.description ?? "",
      personality: card.personality ?? "",
      scenario: card.scenario ?? "",
      firstMessage: card.firstMessage ?? "",
      alternateGreetings: card.alternateGreetings ?? [],
      systemPrompt: card.systemPrompt ?? "",
      postHistoryInstructions: card.postHistoryInstructions ?? "",
      exampleMessages: card.exampleMessages ?? [],
      creatorNotes: card.creatorNotes ?? "",
      tags: card.tags ?? [],
      category: card.category ?? "",
      version: card.version ?? "1.0.0",
      lorebookEntries: (job.result.lorebookEntries ?? []).map((e) => ({
        keys: e.keys,
        content: e.content,
        comment: e.comment,
        priority: e.priority,
      })),
    });
    if (card.name && !name) setName(card.name);
    if (card.title && !title) setTitle(card.title ?? "");
    if (card.tagline && !tagline) setTagline(card.tagline);
  }

  return (
    <DialogSurface
      onClose={onClose}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      panelClassName="flex w-[640px] max-w-[95vw] flex-col gap-4 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-5 shadow-2xl"
    >
      <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`grid size-7 place-items-center rounded-lg ${AVATAR_GRADIENTS[color]}`}
            >
              <Drama className="size-3.5 text-white" />
            </div>
            <h2 className="text-[14px] font-semibold text-white">New Character</h2>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setMode("manual");
                setDraft(null);
                runner.reset();
                setError(null);
              }}
              className={`rounded px-2 py-1 font-medium transition-colors ${
                mode === "manual"
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-dim)] hover:text-white"
              }`}
            >
              Manual
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("concept");
                setError(null);
              }}
              className={`rounded px-2 py-1 font-medium transition-colors ${
                mode === "concept"
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "text-[var(--color-text-dim)] hover:text-white"
              }`}
            >
              <WandSparkles className="mr-1 inline size-3" />
              From concept
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-6 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
      </header>

      {mode === "manual" ? (
        <>
          <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
                  Name
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Lyra Ashwood"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[13px] text-white placeholder:text-[var(--color-text-dim)]/50 focus:border-[var(--color-accent)] focus:outline-none"
                  autoFocus
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
                  Title <span className="font-normal normal-case opacity-60">(optional)</span>
                </span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Elven Ranger"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[13px] text-white placeholder:text-[var(--color-text-dim)]/50 focus:border-[var(--color-accent)] focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
                  Tagline
                </span>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="A one-line summary"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[13px] text-white placeholder:text-[var(--color-text-dim)]/50 focus:border-[var(--color-accent)] focus:outline-none"
                />
              </label>

              <div className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
                  Avatar Color
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {CHARACTER_AVATAR_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`size-7 rounded-md ${AVATAR_GRADIENTS[c]} ring-offset-2 ring-offset-[var(--color-panel)] transition-transform hover:scale-110 ${
                        c === color
                          ? "ring-2 ring-white"
                          : "ring-1 ring-inset ring-white/10"
                      }`}
                      aria-label={c}
                    />
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-dim)]">
                <input
                  type="checkbox"
                  checked={isGlobal}
                  onChange={(e) => setIsGlobal(e.target.checked)}
                  className="size-3.5 rounded border-[var(--color-border)] bg-[var(--color-bg)] accent-[var(--color-accent)]"
                />
                <span>Global (available in every project)</span>
              </label>

              {error && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
                  {error}
                </div>
              )}
            </div>

          <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-[12.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={busy || !name.trim()}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4)] hover:brightness-110 disabled:opacity-50"
              >
                {busy ? "Creating…" : "Create Character"}
              </button>
          </footer>
        </>
      ) : (
        <ConceptMode
          concept={concept}
          setConcept={setConcept}
          tone={tone}
          setTone={setTone}
          color={color}
          setColor={setColor}
          isGlobal={isGlobal}
          setIsGlobal={setIsGlobal}
          draft={draft}
          setDraft={setDraft}
          jobBuffer={job.buffer}
          jobBusy={job.running}
          jobError={job.error}
          onGenerate={generate}
          onCancel={runner.cancel}
          onReset={() => {
            runner.reset();
            setDraft(null);
          }}
          onSave={handleSaveDraft}
          onSaveManual={() => {
            setMode("manual");
            if (draft?.name) setName(draft.name);
            if (draft?.title) setTitle(draft.title);
            if (draft?.tagline) setTagline(draft.tagline);
          }}
          error={error}
          setError={setError}
          busy={busy}
        />
      )}
    </DialogSurface>
  );
}

interface ConceptModeProps {
  concept: string;
  setConcept: (s: string) => void;
  tone: string;
  setTone: (s: string) => void;
  color: CharacterAvatarColor;
  setColor: (c: CharacterAvatarColor) => void;
  isGlobal: boolean;
  setIsGlobal: (b: boolean) => void;
  draft: GeneratedDraft | null;
  setDraft: (d: GeneratedDraft | null) => void;
  jobBuffer: string;
  jobBusy: boolean;
  jobError: string | null;
  onGenerate: () => void;
  onCancel: () => void;
  onReset: () => void;
  onSave: () => void;
  onSaveManual: () => void;
  error: string | null;
  setError: (s: string | null) => void;
  busy: boolean;
}

function ConceptMode(props: ConceptModeProps) {
  const { draft } = props;
  return (
    <>
      <div className="flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: "70vh" }}>
        <section>
          <h3 className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-emerald-200/80">
            Describe your character
          </h3>
          <textarea
            value={props.concept}
            onChange={(e) => props.setConcept(e.target.value)}
            placeholder="A gruff ex-detective running a tea shop in a small coastal town, haunted by the one case he never solved. Speaks in clipped sentences, but softens around his niece."
            rows={4}
            className="w-full rounded-md border border-emerald-300/25 bg-[var(--color-bg)] px-3 py-2 text-[13px] leading-relaxed text-white placeholder:text-[var(--color-text-dim)]/50 focus:border-emerald-300/40 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-dim)]">
            <span>Tone:</span>
            <select
              value={props.tone}
              onChange={(e) => props.setTone(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-[11.5px] text-white focus:border-emerald-300/40 focus:outline-none"
            >
              {CHARACTER_TONE_PRESETS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={props.onGenerate}
              disabled={props.jobBusy || !props.concept.trim()}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-emerald-500/85 px-3 py-1.5 text-[12px] font-medium text-white shadow-[0_0_0_1px_rgba(16,185,129,0.4)] hover:brightness-110 disabled:opacity-50"
            >
              {props.jobBusy ? <Loader2 className="size-3 animate-spin" /> : <WandSparkles className="size-3" />}
              {props.jobBusy ? "Generating…" : "Generate draft"}
            </button>
          </div>
        </section>

        {(props.jobBusy || props.jobBuffer) && (
          <StreamingPreview
            buffer={props.jobBuffer}
            busy={props.jobBusy}
            onCancel={props.onCancel}
            hint={props.jobBusy ? "Drafting character…" : "Draft preview"}
          />
        )}

        {props.jobError && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
            {props.jobError}
          </div>
        )}

        {draft && (
          <DraftPreview draft={draft} setDraft={props.setDraft} />
        )}

        <section className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
              Avatar color
            </span>
            <div className="flex gap-1.5">
              {CHARACTER_AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => props.setColor(c)}
                  className={`size-6 rounded ${AVATAR_GRADIENTS[c]} transition-transform hover:scale-110 ${
                    c === props.color ? "ring-2 ring-white" : "ring-1 ring-inset ring-white/10"
                  }`}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <label className="ml-auto flex items-center gap-2 text-[12px] text-[var(--color-text-dim)]">
            <input
              type="checkbox"
              checked={props.isGlobal}
              onChange={(e) => props.setIsGlobal(e.target.checked)}
              className="size-3.5 rounded border-[var(--color-border)] bg-[var(--color-bg)] accent-[var(--color-accent)]"
            />
            <span>Global character</span>
          </label>
        </section>

        {props.error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
            {props.error}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-3">
        {draft && !props.jobBusy && (
          <SuggestionActions
            onApply={props.onSave}
            onReroll={() => {
              props.setDraft(null);
              props.onGenerate();
            }}
            onDiscard={props.onReset}
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          {draft && (
            <button
              type="button"
              onClick={props.onSaveManual}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[12px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            >
              Edit manually
              <ChevronRight className="ml-1 inline size-3" />
            </button>
          )}
          <button
            type="button"
            onClick={props.busy ? undefined : () => (draft ? props.onSave() : undefined)}
            disabled={!draft || props.busy || props.jobBusy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4)] hover:brightness-110 disabled:opacity-50"
          >
            {props.busy ? "Saving…" : draft ? "Save Character" : "Generate first"}
          </button>
        </div>
      </footer>
    </>
  );
}

function DraftPreview({
  draft,
  setDraft,
}: {
  draft: GeneratedDraft;
  setDraft: (d: GeneratedDraft | null) => void;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-md border border-emerald-300/20 bg-emerald-300/[0.03] p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
        Draft preview
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <Field
          label="Name"
          value={draft.name}
          onChange={(v) => setDraft({ ...draft, name: v })}
          placeholder="(required)"
        />
        <Field
          label="Title"
          value={draft.title}
          onChange={(v) => setDraft({ ...draft, title: v })}
        />
      </div>
      <Field
        label="Tagline"
        value={draft.tagline}
        onChange={(v) => setDraft({ ...draft, tagline: v })}
      />
      <Field
        label="Description"
        value={draft.description}
        onChange={(v) => setDraft({ ...draft, description: v })}
        multiline
        rows={4}
      />
      <Field
        label="Personality"
        value={draft.personality}
        onChange={(v) => setDraft({ ...draft, personality: v })}
        multiline
        rows={3}
      />
      <Field
        label="Scenario"
        value={draft.scenario}
        onChange={(v) => setDraft({ ...draft, scenario: v })}
        multiline
        rows={2}
      />
      <Field
        label="First message"
        value={draft.firstMessage}
        onChange={(v) => setDraft({ ...draft, firstMessage: v })}
        multiline
        rows={3}
      />
      {draft.alternateGreetings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-emerald-200/80">
            Alternate greetings ({draft.alternateGreetings.length})
          </span>
          {draft.alternateGreetings.map((g, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="mt-1.5 shrink-0 rounded bg-[var(--color-bg)] px-1.5 text-[10.5px] text-[var(--color-text-dim)]">
                #{i + 1}
              </span>
              <textarea
                value={g}
                onChange={(e) => {
                  const next = [...draft.alternateGreetings];
                  next[i] = e.target.value;
                  setDraft({ ...draft, alternateGreetings: next });
                }}
                rows={2}
                className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12px] text-white focus:border-emerald-300/40 focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}
      {draft.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-emerald-200/80">
            Tags
          </span>
          {draft.tags.map((tag, i) => (
            <span
              key={i}
              className="rounded border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10.5px] text-emerald-100"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {draft.lorebookEntries.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-emerald-200/80">
            Suggested lorebook entries ({draft.lorebookEntries.length})
          </span>
          {draft.lorebookEntries.map((e, i) => (
            <div
              key={i}
              className="rounded-md border border-emerald-300/15 bg-[var(--color-bg)]/60 p-2 text-[12px] text-white/80"
            >
              <div className="text-[10.5px] uppercase tracking-wide text-emerald-200/80">
                {e.comment || e.keys.join(", ")}
              </div>
              <div className="mt-0.5 whitespace-pre-wrap text-[11.5px] text-white/65">
                {e.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-emerald-200/80">
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12px] text-white placeholder:text-[var(--color-text-dim)]/50 focus:border-emerald-300/40 focus:outline-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12px] text-white placeholder:text-[var(--color-text-dim)]/50 focus:border-emerald-300/40 focus:outline-none"
        />
      )}
    </label>
  );
}
