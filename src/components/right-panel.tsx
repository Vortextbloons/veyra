import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
  Trash2,
} from "lucide-react";
import type { ContextStats, RightPanelProps } from "@/lib/chat-types";
import { useDocumentStore } from "@/modules/documents/document-store";
import { formatDocumentType } from "@/modules/documents/document-export";
import { useSettingsStore } from "@/stores/settings-store";

export function RightPanel({
  contextStats,
  collapsed: collapsedProp,
  onCollapsedChange,
  hidden,
  webSearchEnabled = false,
  onWebSearchChange,
  isAgentsMode = false,
  agentSessionCount = 0,
  agentActiveCount = 0,
  onAgentClearSessions,
}: RightPanelProps) {
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const collapsed = collapsedProp ?? collapsedInternal;
  const setCollapsed = (value: boolean) => {
    onCollapsedChange?.(value);
    if (collapsedProp === undefined) setCollapsedInternal(value);
  };
  const documentPanelEnabled = useSettingsStore((s) => s.documentPanelEnabled);
  const setDocumentPanelEnabled = useSettingsStore((s) => s.setDocumentPanelEnabled);

  return (
    <aside
      className={`relative flex h-full shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] transition-[width,opacity] duration-200 ease-out ${
        hidden
          ? "w-0 overflow-hidden opacity-0 pointer-events-none"
          : collapsed
            ? "w-11 overflow-visible"
            : "w-[300px] min-w-0"
      }`}
      aria-hidden={hidden}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.06),transparent_70%)]"
      />

      {hidden ? null : collapsed ? (
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
              on={webSearchEnabled}
              onChange={(on) => onWebSearchChange?.(on)}
            />
            <CompactToolToggle
              icon={<FileText className="size-3.5" />}
              label="Doc Editor"
              on={documentPanelEnabled}
              onChange={setDocumentPanelEnabled}
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

          {isAgentsMode && (
            <AgentSessionsPanel
              sessionCount={agentSessionCount}
              activeCount={agentActiveCount}
              onClearSessions={onAgentClearSessions}
            />
          )}

          <ContextPanel stats={contextStats} />

          {!isAgentsMode && <ProjectPlaceholder />}

          <ToolsPanel
            webSearch={webSearchEnabled}
            onWebSearchChange={(on) => onWebSearchChange?.(on)}
          />

          <DocumentsPanel />

          <DocumentSettingsPanel />
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

function AgentSessionsPanel({
  sessionCount,
  activeCount,
  onClearSessions,
}: {
  sessionCount: number;
  activeCount: number;
  onClearSessions?: () => void;
}) {
  return (
    <PanelShell title="Sessions">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[20px] font-semibold text-white">{sessionCount}</span>
            <span className="text-[11px] text-[var(--color-text-dim)]">total</span>
          </div>
          {activeCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-indigo-400" />
              <span className="text-[12px] font-medium text-indigo-300">
                {activeCount} running
              </span>
            </div>
          )}
        </div>
        {sessionCount > 0 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClearSessions}
              title="Clear all sessions"
              className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] transition-colors hover:bg-red-400/10 hover:text-red-300"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      <p className="mt-2 text-[10.5px] text-[var(--color-text-dim)]">
        Send tasks from the composer below
      </p>
    </PanelShell>
  );
}

function ContextPanel({ stats }: { stats?: ContextStats }) {
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

function ProjectPlaceholder() {
  return (
    <PanelShell
      title="Active Project"
      action={
        <button type="button" aria-label="Project options" className="text-[var(--color-text-dim)] hover:text-white">
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
        <span
          className={`grid place-items-center transition-colors ${
            on ? "text-emerald-300" : "text-[var(--color-text-dim)]"
          }`}
        >
          {icon}
        </span>
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
  const documentPanelEnabled = useSettingsStore((s) => s.documentPanelEnabled);
  const setDocumentPanelEnabled = useSettingsStore((s) => s.setDocumentPanelEnabled);

  return (
    <PanelShell title="Tools">
      <div className="space-y-0.5">
        <ToolRow
          icon={<Globe className="size-3.5" />}
          label="Web Search"
          on={webSearch}
          onChange={onWebSearchChange}
        />
        <ToolRow
          icon={<FileText className="size-3.5" />}
          label="Documents"
          on={documentPanelEnabled}
          onChange={setDocumentPanelEnabled}
        />
      </div>
    </PanelShell>
  );
}

function DocumentsPanel() {
  const documentPanelEnabled = useSettingsStore((s) => s.documentPanelEnabled);
  const documents = useDocumentStore((s) => s.documents);
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const openDocument = useDocumentStore((s) => s.openDocument);

  if (!documentPanelEnabled) return null;

  if (documents.length === 0) {
    return (
      <PanelShell title="Documents">
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-3 text-center">
          <p className="text-[11px] text-[var(--color-text-dim)]">
            No documents yet
          </p>
          <p className="mt-1 text-[10px] text-[var(--color-text-dim)]/70">
            Ask the AI to create one
          </p>
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Documents">
      <div className="space-y-1">
        {documents.slice(0, 10).map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => void openDocument(doc.id)}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] transition-colors ${
              doc.id === activeDocumentId
                ? "bg-indigo-500/10 text-indigo-300 ring-1 ring-inset ring-indigo-500/20"
                : "text-[var(--color-text)] hover:bg-white/[0.04]"
            }`}
          >
            <FileText className="size-3.5 shrink-0 text-[var(--color-text-dim)]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <p className="truncate font-medium">{doc.title}</p>
                {doc.isGlobal && (
                  <Globe className="size-3 shrink-0 text-amber-400" />
                )}
              </div>
              <p className="text-[10px] text-[var(--color-text-dim)]">
                {formatDocumentType(doc.type)}
              </p>
            </div>
          </button>
        ))}
        {documents.length > 10 && (
          <p className="px-2.5 pt-1 text-[10px] text-[var(--color-text-dim)]">
            +{documents.length - 10} more
          </p>
        )}
      </div>
    </PanelShell>
  );
}

function DocumentSettingsPanel() {
  const [expanded, setExpanded] = useState(false);
  const documentPanelEnabled = useSettingsStore((s) => s.documentPanelEnabled);

  const documentAutoSaveEnabled = useSettingsStore((s) => s.documentAutoSaveEnabled);
  const setDocumentAutoSaveEnabled = useSettingsStore((s) => s.setDocumentAutoSaveEnabled);
  const documentAutoSaveDelay = useSettingsStore((s) => s.documentAutoSaveDelay);
  const setDocumentAutoSaveDelay = useSettingsStore((s) => s.setDocumentAutoSaveDelay);
  const documentDefaultType = useSettingsStore((s) => s.documentDefaultType);
  const setDocumentDefaultType = useSettingsStore((s) => s.setDocumentDefaultType);
  const documentWordWrap = useSettingsStore((s) => s.documentWordWrap);
  const setDocumentWordWrap = useSettingsStore((s) => s.setDocumentWordWrap);
  const documentFontSize = useSettingsStore((s) => s.documentFontSize);
  const setDocumentFontSize = useSettingsStore((s) => s.setDocumentFontSize);
  const documentTabSize = useSettingsStore((s) => s.documentTabSize);
  const setDocumentTabSize = useSettingsStore((s) => s.setDocumentTabSize);
  const documentSpellCheck = useSettingsStore((s) => s.documentSpellCheck);
  const setDocumentSpellCheck = useSettingsStore((s) => s.setDocumentSpellCheck);
  const documentAutoOpenOnCreate = useSettingsStore((s) => s.documentAutoOpenOnCreate);
  const setDocumentAutoOpenOnCreate = useSettingsStore((s) => s.setDocumentAutoOpenOnCreate);

  if (!documentPanelEnabled) return null;

  return (
    <PanelShell
      title="Editor Settings"
      action={
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-[var(--color-text-dim)] hover:text-white"
          aria-label={expanded ? "Collapse editor settings" : "Expand editor settings"}
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
      }
    >
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-[11px] text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
        >
          <Settings2 className="size-3.5" />
          <span>Configure editor behavior</span>
        </button>
      ) : (
        <div className="space-y-3">
          {/* Auto-save toggle */}
          <SettingToggle
            label="Auto-save"
            description="Automatically save while editing"
            on={documentAutoSaveEnabled}
            onChange={setDocumentAutoSaveEnabled}
          />

          {/* Auto-save delay */}
          {documentAutoSaveEnabled && (
            <SettingSlider
              label="Save delay"
              value={documentAutoSaveDelay}
              min={200}
              max={3000}
              step={100}
              formatValue={(v) => `${v}ms`}
              onChange={setDocumentAutoSaveDelay}
            />
          )}

          {/* Auto-open on create */}
          <SettingToggle
            label="Auto-open"
            description="Open panel when AI creates a doc"
            on={documentAutoOpenOnCreate}
            onChange={setDocumentAutoOpenOnCreate}
          />

          {/* Default document type */}
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[var(--color-text)]">
              Default type
            </label>
            <select
              value={documentDefaultType}
              onChange={(e) => setDocumentDefaultType(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[11px] text-[var(--color-text)] outline-none focus:border-indigo-500/50"
            >
              <option value="document">Document</option>
              <option value="technical_spec">Technical Spec</option>
              <option value="essay">Essay</option>
              <option value="report">Report</option>
              <option value="proposal">Proposal</option>
              <option value="readme">README</option>
              <option value="notes">Notes</option>
              <option value="prompt">Prompt</option>
              <option value="project_plan">Project Plan</option>
              <option value="meeting_notes">Meeting Notes</option>
              <option value="research_brief">Research Brief</option>
              <option value="agent_instruction">Agent Instruction</option>
            </select>
          </div>

          {/* Font size */}
          <SettingSlider
            label="Font size"
            value={documentFontSize}
            min={10}
            max={22}
            step={1}
            formatValue={(v) => `${v}px`}
            onChange={setDocumentFontSize}
          />

          {/* Tab size */}
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[var(--color-text)]">
              Tab size
            </label>
            <div className="flex gap-1">
              {[2, 4, 8].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setDocumentTabSize(size)}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    documentTabSize === size
                      ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-inset ring-indigo-500/30"
                      : "text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Word wrap */}
          <SettingToggle
            label="Word wrap"
            description="Wrap long lines in the editor"
            on={documentWordWrap}
            onChange={setDocumentWordWrap}
          />

          {/* Spell check */}
          <SettingToggle
            label="Spell check"
            description="Browser spell check in editor"
            on={documentSpellCheck}
            onChange={setDocumentSpellCheck}
          />
        </div>
      )}
    </PanelShell>
  );
}

function SettingToggle({
  label,
  description,
  on,
  onChange,
}: {
  label: string;
  description?: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left"
    >
      <div className="min-w-0">
        <span className="block text-[11px] font-medium text-[var(--color-text)]">{label}</span>
        {description && (
          <span className="block text-[10px] text-[var(--color-text-dim)]">{description}</span>
        )}
      </div>
      <span
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
          on ? "bg-emerald-500" : "bg-white/10"
        }`}
      >
        <span
          className={`inline-block size-3 rounded-full bg-white shadow-sm transition-transform ${
            on ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function SettingSlider({
  label,
  value,
  min,
  max,
  step,
  formatValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium text-[var(--color-text)]">{label}</label>
        <span className="text-[10px] text-[var(--color-text-dim)]">{formatValue(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-indigo-500 [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-400"
      />
    </div>
  );
}
