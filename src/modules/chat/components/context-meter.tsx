import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ContextBreakdown, ContextStats } from "@/modules/chat/chat-types";
import { CONTEXT_BLOCK_ACCENTS } from "@/modules/chat/chat-types";
import { getBreakdownInputTokens } from "@/lib/context-breakdown";
import { formatTokenCount } from "@/lib/format-tokens";
import { ContextBreakdownPanel } from "@/modules/chat/components/context-breakdown";

const POPOVER_WIDTH = 300;
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

const INPUT_COLOR = "#22d3ee";
const OUTPUT_COLOR = "#f472b6";

function usageSegments(percent: number, usage?: ContextStats): { color: string; length: number }[] {
  const input = Math.max(0, usage?.inputTokens ?? 0);
  const output = Math.max(0, usage?.outputTokens ?? 0);
  const used = Math.min(100, Math.max(0, percent));
  if (input + output === 0) return [{ color: "var(--color-accent)", length: used }];
  return [
    { color: INPUT_COLOR, length: used * input / (input + output) },
    { color: OUTPUT_COLOR, length: used * output / (input + output) },
  ];
}

function percentTextClass(percent: number): string {
  if (percent >= 100) return "text-red-300";
  if (percent >= 85) return "text-amber-300";
  return "text-white";
}

export function ContextMeterRing({ percent, breakdown, usage }: { percent: number; breakdown?: ContextBreakdown; usage?: ContextStats }) {
  const size = 28;
  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const displayPercent = getRoundedPercent(breakdown, percent);
  const segments = useMemo(() => breakdown ? getSegments(breakdown, circumference)
    : usageSegments(displayPercent, usage).map((segment) => ({ ...segment, length: segment.length / 100 * circumference })),
  [breakdown, circumference, displayPercent, usage]);
  return (
    <span className="relative grid size-7 place-items-center">
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx="14" cy="14" r={radius} fill="none" stroke="var(--color-border)" strokeWidth="3.5" />
        {segments.map((segment, index) => {
          const start = segments.slice(0, index).reduce((sum, item) => sum + item.length, 0);
          return <circle key={index} cx="14" cy="14" r={radius} fill="none" stroke={segment.color} strokeWidth="3.5" strokeDasharray={`${segment.length} ${circumference}`} strokeDashoffset={-start} />;
        })}
      </svg>
      <span className={`absolute text-[7.5px] font-semibold tabular-nums ${percentTextClass(displayPercent)}`}>{displayPercent}%</span>
    </span>
  );
}

export function ContextMeterBar({
  percent,
  breakdown,
  reservedPercent = 0,
  usage,
}: {
  percent: number;
  breakdown?: ContextBreakdown;
  reservedPercent?: number;
  usage?: ContextStats;
}) {
  const used = Math.max(0, Math.min(100, getRoundedPercent(breakdown, percent)));
  const reserved = Math.max(0, Math.min(100 - used, reservedPercent));
  const segments = useMemo(() => breakdown ? getSegments(breakdown, 100) : usageSegments(used, usage), [breakdown, used, usage]);
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]" aria-hidden="true">
      {segments.map((segment, index) => (
        <span key={index} style={{ width: `${segment.length}%`, background: segment.color }} />
      ))}
      <span style={{ width: `${reserved}%` }} className="bg-white/20" />
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
  } = stats;
  const includedText =
    includedLabel === "messages"
      ? `${includedMessages} message${includedMessages !== 1 ? "s" : ""}`
      : `${includedMessages} ${includedLabel}`;

  return (
    <div className={`space-y-1 text-center ${className}`}>
      <p className="text-[12px] text-[var(--color-text-dim)]">
        <span className="font-medium tabular-nums text-[var(--color-text)]">
          {formatTokenCount(estimatedTokens)}
        </span>
        {" / "}
        <span className="tabular-nums">{formatTokenCount(contextLimit)} tokens</span>
      </p>
      <p className="text-[10.5px] text-[var(--color-text-dim)]">
        {includedText} · {formatTokenCount(reservedOutputTokens)} reserved
      </p>
      {droppedMessages > 0 && (
        <p className="text-[10.5px] text-amber-400">
          {droppedMessages} message{droppedMessages !== 1 ? "s" : ""} dropped
        </p>
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
  const limit = breakdown?.contextLimit ?? stats?.contextLimit ?? 0;
  const usedTokens = breakdown ? getBreakdownInputTokens(breakdown) : stats?.estimatedTokens ?? 0;
  const reservedTokens = breakdown?.reservedOutputTokens ?? stats?.reservedOutputTokens ?? 0;
  const remainingTokens = Math.max(0, limit - usedTokens - reservedTokens);
  const reservedPercent = limit > 0 ? reservedTokens / limit * 100 : 0;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [positioned, setPositioned] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(true);
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
        onBlur={(event) => {
          if (!popoverRef.current?.contains(event.relatedTarget as Node | null)) hidePopover();
        }}
        className="grid size-8 place-items-center rounded-full transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      >
        <ContextMeterRing percent={percent} breakdown={breakdown} usage={stats} />
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
              maxWidth: `calc(100vw - ${VIEWPORT_PAD * 2}px)`,
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
            <div className="py-3">
              <ContextMeterBar percent={percent} breakdown={breakdown} reservedPercent={reservedPercent} usage={stats} />
            </div>
            <dl className="mb-3 space-y-1.5 text-[11px]">
              {[
                ["Used context", usedTokens, "bg-accent"],
                ["Reserved for next reply", reservedTokens, "bg-white/20"],
                ["Remaining after reserve", remainingTokens, "bg-white/[0.07]"],
              ].map(([label, count, color]) => (
                <div key={String(label)} className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-[var(--color-text-dim)]"><span className={`size-1.5 rounded-sm ${color}`} />{label}</dt>
                  <dd className="tabular-nums text-[var(--color-text)]">{Number(count).toLocaleString()}</dd>
                </div>
              ))}
            </dl>
            <dl className="mb-3 space-y-1.5 border-t border-[var(--color-border)] pt-2 text-[11px]">
              <div className="mb-2 text-[10px] text-[var(--color-text-dim)]">Latest model call</div>
              {[["Input (includes cache)", stats?.inputTokens], ["Output", stats?.outputTokens]].map(([label, count]) => (
                <div key={String(label)} className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-[var(--color-text-dim)]"><span className="size-1.5 rounded-sm" style={{ background: label === "Output" ? OUTPUT_COLOR : INPUT_COLOR }} />{label}</dt>
                  <dd className="tabular-nums text-[var(--color-text)]">{typeof count === "number" ? formatTokenCount(count) : "Pending"}</dd>
                </div>
              ))}
            </dl>
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
