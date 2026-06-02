import { useState, type ReactNode } from "react";
import { Globe, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { ContextStats, RightPanelProps } from "@/lib/chat-types";

export function RightPanel({
  contextStats,
  collapsed: collapsedProp,
  onCollapsedChange,
}: RightPanelProps) {
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const collapsed = collapsedProp ?? collapsedInternal;
  const setCollapsed = (value: boolean) => {
    onCollapsedChange?.(value);
    if (collapsedProp === undefined) setCollapsedInternal(value);
  };
  const [webSearch, setWebSearch] = useState(false);

  return (
    <aside
      className={`relative flex h-full shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] transition-[width] duration-200 ease-out ${
        collapsed ? "w-11 overflow-visible" : "w-[300px] min-w-0"
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.06),transparent_70%)]"
      />

      {collapsed ? (
        <div className="relative z-10 flex h-full flex-col items-center gap-4 py-3">
          <button
            type="button"
            aria-label="Expand context and tools"
            aria-expanded={false}
            onClick={() => setCollapsed(false)}
            className="grid size-8 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            <PanelRightOpen className="size-4" />
          </button>

          <ContextRingCompact stats={contextStats} />

          <div className="flex flex-col items-center gap-1.5">
            <CompactToolToggle
              icon={<Globe className="size-3.5" />}
              label="Web Search"
              on={webSearch}
              onChange={setWebSearch}
            />
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <div className="flex justify-end">
            <button
              type="button"
              aria-label="Collapse context and tools"
              aria-expanded={true}
              onClick={() => setCollapsed(true)}
              className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            >
              <PanelRightClose className="size-3.5" />
            </button>
          </div>

          <ContextPanel stats={contextStats} />
          <ProjectPlaceholder />
          <ToolsPanel webSearch={webSearch} onWebSearchChange={setWebSearch} />
        </div>
      )}
    </aside>
  );
}

function PanelShell({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[12.5px] font-medium text-[var(--color-text)]">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ContextPanel({ stats }: { stats?: ContextStats }) {
  const percent = stats?.percentUsed ?? 0;

  return (
    <PanelShell
      title="Context"
      action={
        <button className="text-[10.5px] text-[var(--color-text-dim)] hover:text-white">
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

function ContextDetails({
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
  } = stats;

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
        {includedMessages} message{includedMessages !== 1 ? "s" : ""} included
      </p>
      {droppedMessages > 0 && (
        <p className="text-[12px] text-amber-400">
          {droppedMessages} message{droppedMessages !== 1 ? "s" : ""} dropped
        </p>
      )}
      <p className="text-[11px] text-[var(--color-text-dim)]">
        {reservedOutputTokens} tokens reserved for output
      </p>
    </div>
  );
}

function ContextRingCompact({ stats }: { stats?: ContextStats }) {
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

function ContextRing({
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
  const offset = circumference - (percent / 100) * circumference;

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

function ProjectPlaceholder() {
  return (
    <PanelShell
      title="Active Project"
      action={
        <button className="text-[var(--color-text-dim)] hover:text-white">
          ⋯
        </button>
      }
    >
      <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center">
        <p className="text-[12px] text-[var(--color-text-dim)]">
          No project selected
        </p>
      </div>
    </PanelShell>
  );
}

function ToolRow({
  icon,
  label,
  on,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-[12px] transition-colors ${
        on
          ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/20 hover:bg-emerald-500/15"
          : "text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
      }`}
    >
      <span
        className={`grid size-4 place-items-center transition-colors ${
          on ? "text-emerald-300" : "text-[var(--color-text-dim)]"
        }`}
      >
        {icon}
      </span>
      <span className="flex-1 font-medium">{label}</span>
    </button>
  );
}

function CompactToolToggle({
  icon,
  label,
  on,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="group/tool relative">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${label}: ${on ? "on" : "off"}`}
        onClick={() => onChange(!on)}
        className={`grid size-8 place-items-center rounded-md transition-colors ${
          on
            ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/20 hover:bg-emerald-500/15"
            : "text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
        }`}
      >
        {icon}
      </button>

      <div
        role="tooltip"
        className="pointer-events-none absolute right-full top-1/2 z-50 mr-2.5 -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-1.5 text-[11px] text-[var(--color-text)] opacity-0 shadow-lg shadow-black/30 transition-opacity duration-150 group-hover/tool:opacity-100"
      >
        <span className="font-medium">{label}</span>
        <span className="text-[var(--color-text-dim)]">
          {" "}
          · {on ? "On" : "Off"}
        </span>
      </div>
    </div>
  );
}

function ToolsPanel({
  webSearch,
  onWebSearchChange,
}: {
  webSearch: boolean;
  onWebSearchChange: (on: boolean) => void;
}) {
  return (
    <PanelShell title="Tools">
      <div className="space-y-0.5">
        <ToolRow
          icon={<Globe className="size-3.5" />}
          label="Web Search"
          on={webSearch}
          onChange={onWebSearchChange}
        />
      </div>
    </PanelShell>
  );
}
