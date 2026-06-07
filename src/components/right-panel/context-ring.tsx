import type { ContextStats } from "@/lib/chat-types";
import { PanelShell } from "@/components/right-panel";

export function ContextPanel({ stats }: { stats?: ContextStats }) {
  const percent = stats?.percentUsed ?? 0;

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
        <ContextRing percent={percent} />
      </div>
      <ContextDetails stats={stats} className="mt-3" />
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
      <p
        className={`text-center text-[12px] text-[var(--color-text-dim)] ${className}`}
      >
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

export function ContextRingCompact({ stats }: { stats?: ContextStats }) {
  const percent = stats?.percentUsed ?? 0;

  return (
    <div className="group/context relative">
      <div className="rounded-full ring-1 ring-transparent transition-shadow group-hover/context:ring-[var(--color-border-strong)]">
        <ContextRing percent={percent} size={28} compact />
      </div>

      <div
        role="tooltip"
        className="pointer-events-none absolute right-full top-1/2 z-50 mr-2.5 w-[220px] -translate-y-1/2 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3 opacity-0 shadow-xl shadow-black/40 transition-opacity duration-150 group-hover/context:opacity-100"
      >
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
          Context
        </p>
        <div className="mb-3 grid place-items-center">
          <ContextRing percent={percent} size={72} compact />
        </div>
        <ContextDetails stats={stats} className="text-left" />
      </div>
    </div>
  );
}

export function ContextRing({
  percent,
  size = 120,
  compact = false,
}: {
  percent: number;
  size?: number;
  compact?: boolean;
}) {
  const stroke = compact ? Math.max(3, Math.round(size / 11)) : 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const displayPercent = Math.max(0, Math.min(100, percent));
  const offset = circumference - (displayPercent / 100) * circumference;

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
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#6366f1"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
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
          {percent}%
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
