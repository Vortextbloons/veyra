import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ContextBlock, ContextBreakdown, ContextStats } from "@/lib/chat-types";
import { CONTEXT_BLOCK_ACCENTS } from "@/lib/chat-types";
import { getBreakdownInputTokens } from "@/lib/context-breakdown";
import { PanelShell } from "@/components/right-panel";
import { ContextBreakdownPanel } from "@/components/right-panel/context-breakdown";

function tokenLength(tokens: number, contextLimit: number, circumference: number): number {
  if (tokens <= 0 || contextLimit <= 0) return 0;
  return (tokens / contextLimit) * circumference;
}

function getSegments(
  breakdown: ContextBreakdown,
  circumference: number,
): { color: string; length: number }[] {
  const segs: { color: string; length: number }[] = [];
  const blocks = [
    ...breakdown.systemBlocks,
    ...breakdown.messageBlocks.filter((block) => !block.dropped),
  ];

  for (const block of blocks) {
    const length = tokenLength(block.tokenCount, breakdown.contextLimit, circumference);
    if (length > 0) {
      segs.push({
        color: CONTEXT_BLOCK_ACCENTS[block.category],
        length,
      });
    }
  }

  return segs;
}

function getContextPercent(breakdown?: ContextBreakdown, fallbackPercent = 0): number {
  if (!breakdown) return Math.max(0, Math.min(100, fallbackPercent));
  const inputTokens = getBreakdownInputTokens(breakdown);
  return Math.round((inputTokens / breakdown.contextLimit) * 100);
}

export function ContextPanel({
  stats,
  breakdown,
}: {
  stats?: ContextStats;
  breakdown?: ContextBreakdown;
}) {
  const percent = getContextPercent(breakdown, stats?.percentUsed ?? 0);

  return (
    <PanelShell
      title="Context"
      action={
        <button type="button" aria-label="Context information" className="text-[10.5px] text-[var(--color-text-dim)] hover:text-white">
          ⓘ
        </button>
      }
    >
      <div className="grid place-items-center py-2">
        <ContextRing percent={percent} breakdown={breakdown} />
      </div>
      <ContextDetails stats={stats} className="mt-3" />
      <ContextBreakdownPanel breakdown={breakdown} />
    </PanelShell>
  );
}

export function ContextDetails({
  stats,
  className = "",
}: {
  stats?: ContextStats;
  className?: string;
}) {
  if (!stats) {
    return (
      <p className={`text-center text-[12px] text-[var(--color-text-dim)] ${className}`}>
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
  const includedText = includedLabel === "messages"
    ? `${includedMessages} message${includedMessages !== 1 ? "s" : ""}`
    : `${includedMessages} ${includedLabel}`;

  return (
    <div className={`space-y-1.5 text-center ${className}`}>
      <p className="text-[12px] text-[var(--color-text-dim)]">
        <span className="font-medium text-[var(--color-text)]">
          {estimatedTokens.toLocaleString()}
        </span>
        {" / "}
        {contextLimit.toLocaleString()} tokens
      </p>
      <p className="text-[12px] text-[var(--color-text-dim)]">
        {includedText} included
      </p>
      {droppedMessages > 0 && (
        <p className="text-[12px] text-amber-400">
          {droppedMessages} message{droppedMessages !== 1 ? "s" : ""} dropped
        </p>
      )}
      <p className="text-[11px] text-[var(--color-text-dim)]">
        {reservedOutputTokens} tokens reserved for output
      </p>
      {contextNote && (
        <p className="text-[10.5px] leading-snug text-[var(--color-text-dim)]/80">
          {contextNote}
        </p>
      )}
    </div>
  );
}

const CONTEXT_POPOVER_WIDTH = 260;
const VIEWPORT_PAD = 10;
const POPOVER_GAP = 10;

function ContextCompactPopover({
  stats,
  breakdown,
  percent,
  topBlocks,
  position,
  visible,
  popoverRef,
  onMouseEnter,
  onMouseLeave,
}: {
  stats?: ContextStats;
  breakdown?: ContextBreakdown;
  percent: number;
  topBlocks: ContextBlock[];
  position: { top: number; left: number };
  visible: boolean;
  popoverRef: React.RefObject<HTMLDivElement | null>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return createPortal(
    <div
      ref={popoverRef}
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        width: CONTEXT_POPOVER_WIDTH,
        zIndex: 200,
      }}
      className={`max-h-[min(80vh,calc(100vh-20px))] overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3 shadow-xl shadow-black/40 transition-opacity duration-150 scrollbar-thin ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
        Context
      </p>
      <div className="mb-3 grid place-items-center">
        <ContextRing percent={percent} breakdown={breakdown} size={72} compact />
      </div>
      <ContextDetails stats={stats} className="text-left" />
      {topBlocks.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-[var(--color-border)] pt-2">
          {topBlocks.map((block, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span
                className="block size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: CONTEXT_BLOCK_ACCENTS[block.category] }}
              />
              <span className="flex-1 truncate text-[10px] text-[var(--color-text-dim)]">
                {block.label}
              </span>
              <span className="text-[10px] tabular-nums text-[var(--color-text-dim)]">
                {block.tokenCount.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

export function ContextRingCompact({ stats, breakdown }: { stats?: ContextStats; breakdown?: ContextBreakdown }) {
  const percent = getContextPercent(breakdown, stats?.percentUsed ?? 0);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [positioned, setPositioned] = useState(false);

  const topBlocks = useMemo(() => {
    if (!breakdown) return [];
    const all = [
      ...breakdown.systemBlocks,
      ...breakdown.messageBlocks.filter((b) => !b.dropped),
    ];
    return all.sort((a, b) => b.tokenCount - a.tokenCount).slice(0, 4);
  }, [breakdown]);

  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const showPopover = () => {
    clearHideTimer();
    setOpen(true);
  };

  const hidePopover = () => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setPositioned(false);
    }, 80);
  };

  useLayoutEffect(() => {
    if (!open) return;

    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;

    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const maxTop = window.innerHeight - popoverRect.height - VIEWPORT_PAD;
    const maxLeft = window.innerWidth - popoverRect.width - VIEWPORT_PAD;

    const centeredTop =
      triggerRect.top + triggerRect.height / 2 - popoverRect.height / 2;
    const top = Math.max(VIEWPORT_PAD, Math.min(centeredTop, maxTop));

    const preferredLeft = triggerRect.left - popoverRect.width - POPOVER_GAP;
    const left = Math.max(VIEWPORT_PAD, Math.min(preferredLeft, maxLeft));

    setPosition({ top, left });
    setPositioned(true);
  }, [open, stats, breakdown, topBlocks.length]);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showPopover}
        onMouseLeave={hidePopover}
        className="rounded-full ring-1 ring-transparent transition-shadow hover:ring-[var(--color-border-strong)]"
      >
        <ContextRing percent={percent} breakdown={breakdown} size={28} compact />
      </div>

      {open && (
        <ContextCompactPopover
          stats={stats}
          breakdown={breakdown}
          percent={percent}
          topBlocks={topBlocks}
          position={position}
          visible={positioned}
          popoverRef={popoverRef}
          onMouseEnter={showPopover}
          onMouseLeave={hidePopover}
        />
      )}
    </>
  );
}

export function ContextRing({
  percent,
  breakdown,
  size = 120,
  compact = false,
}: {
  percent: number;
  breakdown?: ContextBreakdown;
  size?: number;
  compact?: boolean;
}) {
  const stroke = compact ? Math.max(3, Math.round(size / 11)) : 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const displayPercent = getContextPercent(breakdown, percent);

  const segments = useMemo(
    () => (breakdown ? getSegments(breakdown, circumference) : []),
    [breakdown, circumference],
  );

  let cumulative = 0;
  const segmentCircles = segments.map((seg, i) => {
    const offset = -cumulative;
    cumulative += seg.length;
    return (
      <circle
        key={i}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={seg.color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${seg.length} ${circumference}`}
        strokeDashoffset={offset}
        strokeLinecap="butt"
      />
    );
  });

  const inputArcLength = breakdown
    ? tokenLength(getBreakdownInputTokens(breakdown), breakdown.contextLimit, circumference)
    : (displayPercent / 100) * circumference;
  const singleOffset = circumference - inputArcLength;

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#1d1f28"
          strokeWidth={stroke}
          fill="none"
        />
        {!breakdown ? (
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
        ) : (
          segmentCircles
        )}
      </svg>
      <div className="absolute text-center">
        <div
          className={`font-semibold leading-none tracking-tight ${
            compact
              ? size <= 32
                ? "text-[7px]"
                : size <= 40
                  ? "text-[8px]"
                  : "text-[11px]"
              : "text-[20px]"
          }`}
        >
          {displayPercent}%
        </div>
        {!compact && (
          <div className="text-[10px] text-[var(--color-text-dim)]">
            of context used
          </div>
        )}
      </div>
    </div>
  );
}
