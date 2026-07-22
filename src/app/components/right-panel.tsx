import { useState, type ReactNode } from "react";
import {
  FileText,
  Folder,
  Globe,
  PanelRightClose,
  PanelRightOpen,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import type { RightPanelProps } from "@/modules/chat/chat-types";
import { useSettingsStore } from "@/stores/settings-store";
import { ContextPanel, ContextRingCompact } from "@/app/components/right-panel/context-ring";
import { DocumentsPanel } from "@/app/components/right-panel/documents-panel";
import { CompactToolToggle, ToolsPanel } from "@/app/components/right-panel/tools-panel";
import { useProjectStore } from "@/modules/projects/project-store";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore } from "@/modules/documents/document-store";
import { PROJECT_KIND_LABELS } from "@/modules/projects/project-types";

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
    <section className="rounded-xl bg-[var(--color-panel)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-[var(--color-text)]">
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
  contextBreakdown,
  collapsed: collapsedProp,
  onCollapsedChange,
  hidden,
  webSearchEnabled = false,
  onWebSearchChange,
  webSearchDisabled = false,
  webSearchDisabledReason,
  codeExecutionEnabled = false,
  onCodeExecutionChange,
  codeExecutionDisabled = false,
  codeExecutionDisabledReason,
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
  const speedPreset = useSettingsStore((s) => s.webSearchSpeedPreset);

  const activeNav = useSettingsStore((s) => s.activeNav);
  const activeProject = useProjectStore((s) => s.activeProject());
  const isProjectsMode = activeNav === "projects";

  // When on Projects page, show project-aware content
  const showProjectPanel = isProjectsMode && !isAgentsMode;

  return (
    <aside
      className={`relative flex h-full shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] transition-[width,opacity] duration-200 ease-out ${
        hidden
          ? "w-0 overflow-hidden opacity-0 pointer-events-none"
          : collapsed
            ? "w-11 overflow-hidden"
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

          {!showProjectPanel && <ContextRingCompact stats={contextStats} breakdown={contextBreakdown} />}

          {showProjectPanel && activeProject && (
            <div className="grid size-8 place-items-center rounded-lg bg-[var(--color-accent-soft)]">
              <Folder className="size-4 text-[var(--color-accent)]" />
            </div>
          )}

          {!showProjectPanel && !isAgentsMode && (
            <div className="flex flex-col items-center gap-1.5">
              <CompactToolToggle
                icon={<Globe className="size-3.5" />}
                label="Web Search"
                on={webSearchDisabled ? false : webSearchEnabled}
                onChange={(on) => onWebSearchChange?.(on)}
                disabled={webSearchDisabled}
                disabledReason={webSearchDisabledReason}
                accent={webSearchEnabled && speedPreset === "fast" ? "cyan" : "emerald"}
              />
              <CompactToolToggle
                icon={<TerminalSquare className="size-3.5" />}
                label="Code Exec"
                on={codeExecutionDisabled ? false : codeExecutionEnabled}
                onChange={(on) => onCodeExecutionChange?.(on)}
                disabled={codeExecutionDisabled}
                disabledReason={codeExecutionDisabledReason}
                accent="amber"
              />
              <CompactToolToggle
                icon={<FileText className="size-3.5" />}
                label="Doc Editor"
                on={documentPanelEnabled}
                onChange={setDocumentPanelEnabled}
              />
            </div>
          )}
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

          {showProjectPanel ? (
            <ProjectContextPanel />
          ) : (
            <>
              <ContextPanel stats={contextStats} breakdown={contextBreakdown} />
              {!isAgentsMode && (
                <ToolsPanel
                  webSearch={webSearchEnabled}
                  onWebSearchChange={(on) => onWebSearchChange?.(on)}
                  webSearchDisabled={webSearchDisabled}
                  webSearchDisabledReason={webSearchDisabledReason}
                  codeExecution={codeExecutionEnabled}
                  onCodeExecutionChange={(on) => onCodeExecutionChange?.(on)}
                  codeExecutionDisabled={codeExecutionDisabled}
                  codeExecutionDisabledReason={codeExecutionDisabledReason}
                />
              )}
              {!isAgentsMode && <DocumentsPanel />}
            </>
          )}
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
  const handleClearSessions = () => {
    if (window.confirm("Clear all agent sessions? This cannot be undone.")) {
      onClearSessions?.();
    }
  };

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
              onClick={handleClearSessions}
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

function ProjectContextPanel() {
  const activeProject = useProjectStore((s) => s.activeProject());
  const conversations = useChatStore((s) => s.conversations);
  const documents = useDocumentStore((s) => s.documents);
  const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId);

  if (!activeProject) {
    return (
      <PanelShell title="Project">
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center">
          <Folder className="mx-auto mb-1.5 size-5 text-[var(--color-text-dim)]" />
          <p className="text-[12px] text-[var(--color-text-dim)]">
            Select a project to see details
          </p>
        </div>
      </PanelShell>
    );
  }

  const projectChats = conversations.filter((c) => c.projectId === activeProject.id);
  const projectDocs = documents.filter((d) => d.projectId === activeProject.id);
  const memoryEnabled = activeProject.settings?.memoryEnabled !== false;

  return (
    <>
      {/* Project info */}
      <PanelShell
        title="Project"
        action={
          <button
            type="button"
            onClick={() => setActiveProjectId(null)}
            className="text-[10px] text-[var(--color-text-dim)] hover:text-white"
          >
            Clear
          </button>
        }
      >
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)]">
            <Folder className="size-4.5 text-[var(--color-accent)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-[var(--color-text)]">
              {activeProject.name}
            </div>
            <div className="text-[11px] text-[var(--color-text-dim)]">
              {PROJECT_KIND_LABELS[activeProject.kind]}
            </div>
          </div>
        </div>
      </PanelShell>

      {/* Stats */}
      <PanelShell title="Project Context">
        <div className="space-y-2.5">
          <StatRow
            label="Chats"
            value={String(projectChats.length)}
          />
          <StatRow
            label="Documents"
            value={String(projectDocs.length)}
          />
          <StatRow
            label="Memory"
            value={memoryEnabled ? "On" : "Off"}
          />
          <StatRow
            label="System prompt"
            value={activeProject.systemPrompt ? "Set" : "Not set"}
          />
        </div>
      </PanelShell>

      {/* System prompt preview */}
      {activeProject.systemPrompt && (
        <PanelShell title="Instructions">
          <p className="line-clamp-4 text-[11px] leading-relaxed text-[var(--color-text-dim)]">
            {activeProject.systemPrompt}
          </p>
        </PanelShell>
      )}
    </>
  );
}

function StatRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[var(--color-text-dim)]">{label}</span>
      <span className="text-[12px] font-medium text-[var(--color-text)]">{value}</span>
    </div>
  );
}
