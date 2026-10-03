import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ContextBreakdown, ContextStats } from "@/modules/chat/chat-types";
import { CONTEXT_BLOCK_ACCENTS } from "@/modules/chat/chat-types";
import { getBreakdownInputTokens } from "@/lib/context-breakdown";
import { ContextBreakdownPanel } from "@/modules/chat/components/context-breakdown";

const POPOVER_WIDTH = 260;
const VIEWPORT_PAD = 12;
const POPOVER_GAP = 10;
const HIDE_DELAY_MS = 120;

function tokenLength(tokens: number, contextLimit: number, circumference: number): number {
  if (tokens <= 0 || contextLimit <= 0) return 0;
  return Math.min(circumference, (tokens / contextLimit) * circumference);
}

function getRoundedPercent(breakdown?: ContextBreakdown, fallbackPercent = 0): number {
  if (!breakdown || breakdown.contextLimit <= 0) {
    return Math.round(Math.max(0, fallbackPercent));
  }
  return Math.round((getBreakdownInputTokens(breakdown) / breakdown.contextLimit) * 100);
}

function getSegments(
  breakdown: ContextBreakdown,
  circumference: number,
): { color: string; length: number }[] {
  const segments: { color: string; length: number }[] = [];
  const blocks = [
    ...breakdown.systemBlocks,
    ...breakdown.messageBlocks.filter((block) => !block.dropped),
  ];

  let remaining = circumference;
  for (const block of blocks) {
    if (remaining <= 0.01) break;
    const length = tokenLength(block.tokenCount, breakdown.contextLimit, circumference);
    if (length <= 0) continue;
    const capped = Math.min(remaining, length);
    segments.push({ color: CONTEXT_BLOCK_ACCENTS[block.category], length: capped });
    remaining -= capped;
  }

  return segments;
}

function percentTextClass(percent: number): string {
  if (percent >= 100) return "text-red-300";
  if (percent >= 85) return "text-amber-300";
  return "text-white";
}

export function ContextMeterRing({
  percent,
  breakdown,
  size = 28,
}: {
  percent: number;
  breakdown?: ContextBreakdown;
  size?: number;
}) {
  const stroke = size >= 64 ? 8 : 3.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const displayPercent = getRoundedPercent(breakdown, percent);

  const segments = useMemo(
    () => (breakdown ? getSegments(breakdown, circumference) : []),
    [breakdown, circumference],
  );

  let cumulative = 0;
  const segmentCircles = segments.map((segment, index) => {
    const offset = -cumulative;
    cumulative += segment.length;
    return (
      <circle
        key={index}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={segment.color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${segment.length} ${circumference}`}
        strokeDashoffset={offset}
        strokeLinecap="butt"
      />
    );
  });

  const singleArcLength = Math.min(
    circumference,
    (Math.max(0, Math.min(100, percent)) / 100) * circumference,
  );
  const singleOffset = circumference - singleArcLength;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#1d1f28"
          strokeWidth={stroke}
          fill="none"
        />
        {breakdown ? (
          segmentCircles
        ) : (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#6366f1"
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={singleOffset}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div
        className={`absolute font-semibold leading-none tracking-tight tabular-nums ${
          size >= 64 ? "text-[15px]" : "text-[7.5px]"
        } ${percentTextClass(displayPercent)}`}
      >
        {displayPercent}%
      </div>
    </div>
  );
}

function ContextMeterDetails({
  stats,
  className = "",
}: {
  stats?: ContextStats;
  className?: string;
}) {
  if (!stats) {
    return (
      <p className={`text-center text-[11.5px] text-[var(--color-text-dim)] ${className}`}>
        No messages yet
      </p>
    );
  }

  const {
    estimatedTokens,
    contextLimit,
    includedMessages,
    droppedMessages,
    reservedOutputTokens,
    includedLabel = "messages",
    contextNote,
  } = stats;
  const includedText =
    includedLabel === "messages"
      ? `${includedMessages} message${includedMessages !== 1 ? "s" : ""}`
      : `${includedMessages} ${includedLabel}`;

  return (
    <div className={`space-y-1 text-center ${className}`}>
      <p className="text-[12px] text-[var(--color-text-dim)]">
        <span className="font-medium tabular-nums text-[var(--color-text)]">
          {estimatedTokens.toLocaleString()}
        </span>
        {" / "}
        <span className="tabular-nums">{contextLimit.toLocaleString()} tokens</span>
      </p>
      <p className="text-[10.5px] text-[var(--color-text-dim)]">
        {includedText} · {reservedOutputTokens.toLocaleString()} reserved
      </p>
      {droppedMessages > 0 && (
        <p className="text-[10.5px] text-amber-400">
          {droppedMessages} message{droppedMessages !== 1 ? "s" : ""} dropped
        </p>
      )}
      {contextNote && (
        <p className="text-[10px] leading-snug text-[var(--color-text-dim)]/75">{contextNote}</p>
      )}
    </div>
  );
}

export function ContextMeterButton({
  stats,
  breakdown,
}: {
  stats?: ContextStats;
  breakdown?: ContextBreakdown;
}) {
  const percent = getRoundedPercent(breakdown, stats?.percentUsed ?? 0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [positioned, setPositioned] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, bottom: 0 });

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  const close = useCallback(() => {
    clearHideTimer();
    setPinned(false);
    setOpen(false);
    setPositioned(false);
  }, [clearHideTimer]);

  const showPopover = useCallback(() => {
    clearHideTimer();
    setOpen(true);
  }, [clearHideTimer]);

  const hidePopover = useCallback(() => {
    if (pinned) return;
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setPositioned(false);
    }, HIDE_DELAY_MS);
  }, [clearHideTimer, pinned]);

  const togglePopover = useCallback(() => {
    if (open && pinned) {
      close();
      return;
    }
    clearHideTimer();
    setPinned(true);
    setOpen(true);
  }, [clearHideTimer, close, open, pinned]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;

    const triggerRect = trigger.getBoundingClientRect();
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_PAD * 2);
    const preferredLeft = triggerRect.right - width;
    const left = Math.max(
      VIEWPORT_PAD,
      Math.min(preferredLeft, window.innerWidth - width - VIEWPORT_PAD),
    );
    const bottom = window.innerHeight - triggerRect.top + POPOVER_GAP;

    setPosition({ left, bottom });
    setPositioned(true);
  }, [open, stats, breakdown]);

  const maxHeight = Math.max(
    200,
    window.innerHeight - position.bottom - VIEWPORT_PAD,
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Context usage: ${percent}%`}
        aria-expanded={open}
        onClick={togglePopover}
        onMouseEnter={showPopover}
        onMouseLeave={hidePopover}
        onFocus={showPopover}
        className="grid size-8 place-items-center rounded-full transition-colors hover:bg-white/5"
      >
        <ContextMeterRing percent={percent} breakdown={breakdown} size={28} />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Context usage"
            onMouseEnter={showPopover}
            onMouseLeave={hidePopover}
            style={{
              position: "fixed",
              left: position.left,
              bottom: position.bottom,
              width: POPOVER_WIDTH,
              maxHeight,
            }}
            className={`overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-3 shadow-xl shadow-black/50 scrollbar-thin transition-opacity duration-150 ${
              positioned ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold text-white">Context</p>
              <span className="text-[10px] tabular-nums text-[var(--color-text-dim)]">
                {percent}% used
              </span>
            </div>
            <div className="grid place-items-center py-2.5">
              <ContextMeterRing percent={percent} breakdown={breakdown} size={72} />
            </div>
            <ContextMeterDetails stats={stats} />
            {breakdown && (
              <>
                <button
                  type="button"
                  aria-expanded={breakdownOpen}
                  onClick={() => setBreakdownOpen((value) => !value)}
                  className="mt-2.5 flex w-full items-center gap-1 border-t border-[var(--color-border)] pt-2 text-[10.5px] text-[var(--color-text-dim)] transition-colors hover:text-white"
                >
                  {breakdownOpen ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronRight className="size-3" />
                  )}
                  Breakdown
                </button>
                {breakdownOpen && <ContextBreakdownPanel breakdown={breakdown} />}
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
