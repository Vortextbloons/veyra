import { WandSparkles, Loader2, ChevronRight } from "lucide-react";
import { CHARACTER_AVATAR_COLORS } from "../character-types";
import type { CharacterAvatarColor } from "../character-types";
import { AVATAR_GRADIENTS } from "../character-gradients";
import { CHARACTER_TONE_PRESETS } from "../ai-assist/tones";
import { StreamingPreview, SuggestionActions } from "../ai-assist/WandButton";
import { DraftPreview } from "./DraftPreview";
import type { GeneratedDraft } from "./character-draft-types";

export interface ConceptModeProps {
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

export function ConceptMode(props: ConceptModeProps) {
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
