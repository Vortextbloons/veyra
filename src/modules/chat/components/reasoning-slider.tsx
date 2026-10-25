import { Brain } from "lucide-react";
import {
  REASONING_LEVEL_LABELS,
  type ReasoningControl,
  type ReasoningLevel,
} from "@/lib/reasoning-capabilities";

type ReasoningSliderProps = {
  levels: ReasoningLevel[];
  value: ReasoningLevel;
  control: ReasoningControl;
  known: boolean;
  message: string;
  checking: boolean;
  disabled?: boolean;
  onChange: (level: ReasoningLevel) => void;
  onRefresh: () => void;
};

/**
 * Compact reasoning-level control for the chat composer. Stops are whatever
 * the installed Pi SDK advertises for the current model.
 */
export function ReasoningSlider({
  levels,
  value,
  control,
  known,
  message,
  checking,
  disabled = false,
  onChange,
  onRefresh,
}: ReasoningSliderProps) {
  const hasSlider = control !== "none" && levels.length > 1;
  const index = Math.max(0, levels.indexOf(value));
  const label =
    control === "none"
      ? "Managed"
      : levels.length === 0
        ? checking
          ? "Checking"
          : "Unavailable"
        : REASONING_LEVEL_LABELS[value] ?? "Off";
  const active = control !== "none" && value !== "off";
  const title = message || (checking ? "Checking reasoning options…" : "Reasoning level");
  const basic = !known && levels.length > 0;

  return (
    <div
      className={`flex items-center gap-1 rounded-md px-1 py-0.5 ${
        active ? "text-violet-200" : "text-[var(--color-text-dim)]"
      }`}
      title={basic ? `${title} Basic levels are shown.` : title}
    >
      <button
        type="button"
        aria-label="Refresh reasoning options"
        title="Refresh reasoning options"
        disabled={disabled}
        onClick={onRefresh}
        className="grid size-5 place-items-center rounded transition-colors hover:bg-white/5 hover:text-white disabled:pointer-events-none disabled:opacity-40"
      >
        <Brain className="size-3.5" />
      </button>
      {hasSlider && (
        <input
          type="range"
          min={0}
          max={levels.length - 1}
          step={1}
          value={index}
          disabled={disabled}
          onChange={(event) => onChange(levels[Number(event.target.value)] ?? "off")}
          aria-label="Reasoning level"
          aria-valuetext={label}
          className="reasoning-range h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 sm:w-20"
          style={{
            background: `linear-gradient(to right, var(--color-accent) ${levels.length > 1 ? (index / (levels.length - 1)) * 100 : 0}%, rgba(255,255,255,0.12) ${levels.length > 1 ? (index / (levels.length - 1)) * 100 : 0}%)`,
          }}
        />
      )}
      <span
        className={`min-w-10 text-[9.5px] uppercase tracking-[0.1em] ${
          active ? "text-violet-200/90" : "text-[var(--color-text-dim)]"
        }`}
        aria-live="polite"
      >
        {label}
      </span>
    </div>
  );
}
