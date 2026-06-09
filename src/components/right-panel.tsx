import { useState, type ReactNode } from "react";
import {
  FileText,
  Globe,
  PanelRightClose,
  PanelRightOpen,
  Trash2,
} from "lucide-react";
import type { RightPanelProps } from "@/lib/chat-types";
import { useSettingsStore } from "@/stores/settings-store";
import { ContextPanel, ContextRingCompact } from "@/components/right-panel/context-ring";
import { DocumentsPanel } from "@/components/right-panel/documents-panel";
import { CompactToolToggle, ToolsPanel } from "@/components/right-panel/tools-panel";

export function PanelShell({
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
        </div>
      )}
    </aside>
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
