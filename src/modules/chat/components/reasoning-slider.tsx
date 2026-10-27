import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Brain, Check, ChevronRight, RefreshCw } from "lucide-react";
import {
  REASONING_LEVEL_LABELS,
  type ReasoningControl,
  type ReasoningLevel,
} from "@/lib/reasoning-capabilities";

const POPOVER_WIDTH = 248;
const VIEWPORT_PAD = 12;
const POPOVER_GAP = 8;
/** Half the `.reasoning-slider` thumb width, so the filled track starts and ends under the thumb's center. */
const THUMB_INSET = 9;

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
 * Discrete effort slider. Rendered inside the composer popover, so every stop is
 * a level the selected model actually advertises and the thumb snaps between them.
 */
function ReasoningTrack({
  levels,
  value,
  disabled,
  onChange,
}: {
  levels: ReasoningLevel[];
  value: ReasoningLevel;
  disabled: boolean;
  onChange: (level: ReasoningLevel) => void;
}) {
  const index = Math.max(0, levels.indexOf(value));
  const max = Math.max(1, levels.length - 1);
  const percent = (index / max) * 100;

  return (
    <div className="relative flex h-8 items-center">
      <div
        aria-hidden
        className="absolute h-3.5 rounded-full bg-white/10"
        style={{ left: THUMB_INSET / 2, right: THUMB_INSET / 2 }}
      >
        <div
          className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-150 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0"
        style={{ left: THUMB_INSET / 2, right: THUMB_INSET / 2 }}
      >
        {levels.map((level, stop) => (
          <span
            key={level}
            className={`absolute top-1/2 size-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/45 ${
              stop === index ? "opacity-0" : ""
            }`}
            style={{ left: `${(stop / max) * 100}%` }}
          />
        ))}
      </div>
      <input
        type="range"
        min={0}
        max={levels.length - 1}
        step={1}
        value={index}
        disabled={disabled}
        onChange={(event) => onChange(levels[Number(event.target.value)] ?? levels[0])}
        aria-label="Reasoning effort"
        aria-valuetext={REASONING_LEVEL_LABELS[value] ?? "Off"}
        className="reasoning-slider relative z-10 h-8 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed disabled:opacity-40"
      />
    </div>
  );
}

/**
 * Reasoning control for the chat composer. The pill shows the active level and
 * opens a popover with a slider, the full option list, and capability details.
 * Models that only support boolean reasoning get a switch instead of a slider.
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
  const [open, setOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, bottom: 0, ready: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // A control that becomes disabled mid-interaction closes instead of lingering.
  const expanded = open && !disabled;

  const hasLevels = control !== "none" && levels.length > 0;
  const isToggleControl = control === "toggle";
  const canSlide = hasLevels && !isToggleControl && levels.length > 1;
  const canToggle = isToggleControl && levels.length > 1 && levels.includes("off");
  const enabled = value !== "off";
  const active = control !== "none" && enabled;
  const label =
    control === "none"
      ? "Managed"
      : levels.length === 0
        ? checking
          ? "Checking"
          : "Unavailable"
        : isToggleControl
          ? enabled ? "On" : "Off"
          : REASONING_LEVEL_LABELS[value] ?? "Off";
  const title = message || (checking ? "Checking reasoning options…" : "Reasoning effort");
  const hint = message.trim()
    || (checking
      ? "Checking reasoning options…"
      : !known && levels.length > 0
        ? "Basic levels are shown."
        : "");
  const toggle = () => onChange(enabled ? "off" : levels.find((level) => level !== "off") ?? "off");

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_PAD * 2);
    setPosition({
      left: Math.max(
        VIEWPORT_PAD,
        Math.min(rect.right - width, window.innerWidth - width - VIEWPORT_PAD),
      ),
      bottom: window.innerHeight - rect.top + POPOVER_GAP,
      ready: true,
    });
  }, []);

  useLayoutEffect(() => {
    if (expanded) place();
  }, [expanded, place]);

  useEffect(() => {
    if (!expanded) return;
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [expanded, place]);

  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
      setListOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setListOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  const togglePopover = () => {
    setListOpen(false);
    setOpen((current) => !current);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Reasoning effort: ${label}`}
        title={title}
        disabled={disabled}
        onClick={togglePopover}
        className={`flex h-7 items-center gap-1 rounded-md px-1.5 text-[9.5px] font-medium uppercase tracking-[0.1em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          open
            ? "bg-white/[0.06] text-white"
            : active
              ? "text-violet-200 hover:bg-white/5 hover:text-white"
              : "text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        }`}
      >
        <Brain className={`size-3.5 shrink-0 ${checking ? "animate-pulse" : ""}`} />
        <span className="min-w-8 text-left">{label}</span>
        <ChevronRight
          className={`size-3 shrink-0 opacity-60 transition-transform ${open ? "-rotate-90" : ""}`}
        />
      </button>

      {expanded &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Reasoning effort"
            style={{
              position: "fixed",
              left: position.left,
              bottom: position.bottom,
              width: Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_PAD * 2),
              maxHeight: Math.max(160, window.innerHeight - position.bottom - VIEWPORT_PAD),
            }}
            className={`z-50 overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] px-3 pb-2 pt-3 shadow-xl shadow-black/50 scrollbar-thin transition-opacity duration-150 ${
              position.ready ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <div className="flex justify-center">
              <button
                type="button"
                aria-expanded={canSlide ? listOpen : undefined}
                disabled={!canSlide}
                onClick={() => setListOpen((current) => !current)}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-semibold text-white transition-colors enabled:hover:bg-white/5 disabled:cursor-default"
              >
                {label}
                {canSlide && (
                  <ChevronRight
                    className={`size-3.5 text-[var(--color-text-dim)] transition-transform ${
                      listOpen ? "rotate-90" : ""
                    }`}
                  />
                )}
              </button>
            </div>

            {canSlide && listOpen && (
              <div className="mt-2 space-y-0.5">
                {levels.map((level) => {
                  const selected = level === value;
                  return (
                    <button
                      key={level}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        onChange(level);
                        setListOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[11.5px] transition-colors ${
                        selected
                          ? "bg-[var(--color-accent-soft)] text-white"
                          : "text-[var(--color-text-dim)] hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      <span>{REASONING_LEVEL_LABELS[level]}</span>
                      {selected && <Check className="size-3 text-[var(--color-accent)]" />}
                    </button>
                  );
                })}
              </div>
            )}

            {canSlide && (
              <div className="mt-2.5">
                <ReasoningTrack
                  levels={levels}
                  value={value}
                  disabled={disabled}
                  onChange={onChange}
                />
              </div>
            )}

            {canToggle && (
              <div className="mt-2.5 flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5">
                <span className="text-[11.5px] text-[var(--color-text)]">Reasoning</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label="Reasoning"
                  disabled={disabled}
                  onClick={toggle}
                  className={`h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    enabled ? "bg-[var(--color-accent)]" : "bg-white/15"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`block size-3 rounded-full bg-white shadow-sm transition-transform ${
                      enabled ? "translate-x-3" : ""
                    }`}
                  />
                </button>
              </div>
            )}

            {hint && (
              <p className="mt-2 text-[10.5px] leading-snug text-[var(--color-text-dim)]/85">
                {hint}
              </p>
            )}

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/[0.07] pt-1.5">
              <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-dim)]">
                Reasoning
              </span>
              <button
                type="button"
                aria-label="Refresh reasoning options"
                title="Refresh reasoning options"
                onClick={onRefresh}
                className="grid size-5 place-items-center rounded text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-white"
              >
                <RefreshCw className={`size-3 ${checking ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
