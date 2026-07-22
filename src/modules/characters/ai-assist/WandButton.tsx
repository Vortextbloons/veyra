import { useState, useRef, useEffect } from "react";
import { WandSparkles, Loader2 } from "lucide-react";

export interface WandAction {
  id: string;
  label: string;
  description: string;
  /** Short instruction string sent to the model. */
  instruction: string;
}

export interface WandButtonProps {
  onAction: (action: WandAction) => void;
  actions: WandAction[];
  busy?: boolean;
  disabled?: boolean;
  /** Optional badge label (e.g. "AI"). */
  badge?: string;
  /** Compact mode renders just the wand icon until hover. */
  compact?: boolean;
}

/**
 * Shared "Wand" affordance. Clicking the icon opens a small emerald popover
 * with the supplied action list. Each action calls onAction with its full
 * definition so callers can build their own prompts.
 */
export function WandButton({
  onAction,
  actions,
  busy = false,
  disabled = false,
  badge = "AI",
  compact = false,
}: WandButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (busy) return;
          setOpen((v) => !v);
        }}
        disabled={disabled}
        title={busy ? "AI is working…" : "AI assist"}
        aria-label="AI assist"
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
          open
            ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-100"
            : "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200/90 hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-100"
        } ${busy ? "cursor-wait" : ""} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <WandSparkles className="size-3" />}
        {!compact && (
          <>
            <span className="uppercase tracking-wide">{badge}</span>
          </>
        )}
      </button>
      {open && !busy && (
        <div
          className="absolute right-0 top-full z-30 mt-1.5 w-64 overflow-hidden rounded-lg border border-emerald-300/25 bg-[#08120f]/95 shadow-2xl shadow-emerald-950/40 backdrop-blur-xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="border-b border-white/10 bg-emerald-400/[0.08] px-3 py-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
              AI assist
            </p>
            <p className="mt-0.5 text-[11px] text-white/55">
              Suggestions will appear below for review. Nothing is written automatically.
            </p>
          </div>
          <div className="flex flex-col gap-0.5 p-1">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onAction(action);
                }}
                className="flex flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left text-[12px] text-white/85 transition hover:bg-emerald-300/12 hover:text-emerald-100"
              >
                <span className="font-medium">{action.label}</span>
                <span className="text-[11px] leading-snug text-white/55">
                  {action.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Inline streaming preview that lives directly under a field while a job is
 * running. Shows the buffer as it streams and a small "Stop" button. After
 * the job is done, the consumer renders the Apply/Re-roll/Discard group
 * itself.
 */
export interface StreamingPreviewProps {
  buffer: string;
  busy: boolean;
  onCancel?: () => void;
  /** Optional hint label (e.g. "Rewriting description…"). */
  hint?: string;
}

export function StreamingPreview({ buffer, busy, onCancel, hint }: StreamingPreviewProps) {
  if (!busy && !buffer) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1.5 rounded-md border border-emerald-300/25 bg-emerald-300/[0.04] p-2.5">
      <div className="flex items-center justify-between text-[10.5px] uppercase tracking-wide text-emerald-200/80">
        <span className="flex items-center gap-1.5">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <WandSparkles className="size-3" />}
          {hint ?? (busy ? "Generating…" : "Suggestion")}
        </span>
        {busy && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 text-emerald-200/80 hover:text-emerald-100"
          >
            Stop
          </button>
        )}
      </div>
      <div className="max-h-48 overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-white/85">
        {buffer || (busy ? "…" : "")}
      </div>
    </div>
  );
}

export interface SuggestionActionsProps {
  onApply: () => void;
  onReroll: () => void;
  onDiscard: () => void;
  busy?: boolean;
}

export function SuggestionActions({ onApply, onReroll, onDiscard, busy }: SuggestionActionsProps) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={onApply}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md bg-emerald-500/85 px-2 py-1 text-[11.5px] font-medium text-white shadow-[0_0_0_1px_rgba(16,185,129,0.4)] hover:brightness-110 disabled:opacity-50"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={onReroll}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/60 px-2 py-1 text-[11.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white disabled:opacity-50"
      >
        Re-roll
      </button>
      <button
        type="button"
        onClick={onDiscard}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/60 px-2 py-1 text-[11.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white disabled:opacity-50"
      >
        Discard
      </button>
    </div>
  );
}
