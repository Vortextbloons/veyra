import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ContextBreakdown, ContextBlock } from "@/modules/chat/chat-types";
import { CONTEXT_BLOCK_ACCENTS } from "@/modules/chat/chat-types";

function ContextBlockRow({
  block,
  totalTokens,
  isDroppedSection = false,
}: {
  block: ContextBlock;
  totalTokens: number;
  isDroppedSection?: boolean;
}) {
  const accent = CONTEXT_BLOCK_ACCENTS[block.category] ?? "var(--color-text-dim)";
  const pct = totalTokens > 0 ? (block.tokenCount / totalTokens) * 100 : 0;

  return (
    <div
      className={`flex items-center gap-2 py-1 ${block.dropped || isDroppedSection ? "opacity-40" : ""}`}
    >
      <span
        className="block size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: accent }}
      />
      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--color-text)]">
        {block.label}
        {block.detail && (
          <span className="ml-1 text-[var(--color-text-dim)]">· {block.detail}</span>
        )}
      </span>
      <span className="shrink-0 text-[10.5px] tabular-nums text-[var(--color-text-dim)]">
        {block.tokenCount.toLocaleString()}
      </span>
      <div
        className="h-1.5 w-10 shrink-0 rounded-full bg-white/5"
        title={`${pct.toFixed(1)}%`}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: accent }}
        />
      </div>
    </div>
  );
}

function ContextBlockSection({
  label,
  count,
  children,
  defaultOpen = false,
  maxHeight = 220,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  maxHeight?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="sticky top-0 z-10 flex w-full items-center gap-1 py-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--color-text-dim)] hover:text-white"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {label}
        <span className="ml-1 font-normal normal-case tracking-normal">({count})</span>
      </button>
      {open && (
        <div
          className="space-y-0.5 overflow-y-auto pl-3 scrollbar-thin"
          style={{ maxHeight: `${maxHeight}px` }}
        >
          {children}
          {count > 10 && (
            <div className="sticky bottom-0 -mx-3 mt-1 px-3 text-center text-[9px] text-[var(--color-text-dim)]/50">
              {count} total
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ContextBreakdownPanel({
  breakdown,
}: {
  breakdown?: ContextBreakdown;
}) {
  if (!breakdown) return null;

  const {
    systemBlocks,
    messageBlocks,
    droppedCount,
    totalSystemTokens,
    totalMessageTokens,
    reservedOutputTokens,
  } = breakdown;

  const hasDropped = droppedCount > 0;
  const includedBlocks = messageBlocks.filter((b) => !b.dropped);
  const droppedBlocks = messageBlocks.filter((b) => b.dropped);
  const totalContextTokens = totalSystemTokens + totalMessageTokens;

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--color-border)] pt-3">
      <div className="max-h-[320px] overflow-y-auto scrollbar-thin">
        <ContextBlockSection label="System" count={systemBlocks.length} defaultOpen>
          {systemBlocks.map((block, i) => (
            <ContextBlockRow
              key={`sys-${i}`}
              block={block}
              totalTokens={totalContextTokens}
            />
          ))}
        </ContextBlockSection>

        <ContextBlockSection label="Messages" count={includedBlocks.length} defaultOpen>
          {includedBlocks.map((block, i) => (
            <ContextBlockRow
              key={`msg-${i}`}
              block={block}
              totalTokens={totalContextTokens}
            />
          ))}
        </ContextBlockSection>

        {hasDropped && (
          <ContextBlockSection label="Dropped" count={droppedCount}>
            {droppedBlocks.map((block, i) => (
              <ContextBlockRow
                key={`drop-${i}`}
                block={block}
                totalTokens={totalContextTokens}
                isDroppedSection
              />
            ))}
          </ContextBlockSection>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-[var(--color-border)] pt-2 text-[10.5px] text-[var(--color-text-dim)]">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-[#818cf8]" />
          System: {totalSystemTokens.toLocaleString()}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-[#34d399]" />
          Messages: {totalMessageTokens.toLocaleString()}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-[#374151]" />
          Reserved: {reservedOutputTokens.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
