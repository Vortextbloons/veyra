import { useState, type ReactNode } from "react";
import { FileText, Folder, PencilLine, FolderOpen, PanelRightClose, PanelRightOpen, RefreshCw, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import type { AgentSession } from "../agent-types";
import { AgentOutputView } from "./agent-output-view";
import { AgentInspector } from "./agent-inspector";
import "./agent-workspace.css";
import { PiQuestion } from "../pi-questions";
import { useProjectStore } from "@/modules/projects/project-store";
import { useAgentStore } from "../agent-store";
import { resolveAgentProjectId } from "../agent-session-context";

type AgentsPanelProps = {
  sessions: AgentSession[]; activeSessionId: string | null; runtimeAvailable: boolean | null;
  projectPath: string; onProjectPathChange: (path: string) => void;
  onCheckRuntime: () => void; onStopSession: (id: string) => void;
  composer: ReactNode; connection: ReactNode; onSuggestion: (text: string) => void;
};

export function AgentsPanel({ sessions, activeSessionId, runtimeAvailable, projectPath, onProjectPathChange, onCheckRuntime, onStopSession, composer, connection, onSuggestion }: AgentsPanelProps) {
  const active = sessions.find((session) => session.id === activeSessionId) ?? null;
  const empty = !active || active.events.length === 0;
  const running = sessions.some((session) => session.status === "running" && session.projectPath === projectPath);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [error, setError] = useState("");
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const selectProject = (id: string) => {
    const project = projects.find((item) => item.id === id);
    useProjectStore.getState().setActiveProjectId(project?.id ?? null);
    onProjectPathChange(project?.settings.agentProjectPath ?? "");
    if (!project?.settings.agentProjectPath) useAgentStore.getState().newSession();
  };
  const attachProject = async () => {
    try {
      const path = await open({ directory: true, title: "Attach a project" });
      if (typeof path === "string") {
        const matchingId = resolveAgentProjectId(path, projects);
        let project = projects.find((item) => item.id === matchingId);
        const selected = projects.find((item) => item.id === activeProjectId);
        if (!project && selected && !selected.settings.agentProjectPath) project = await useProjectStore.getState().updateProject(selected.id, { settings: { ...selected.settings, agentProjectPath: path } });
        if (!project) project = await useProjectStore.getState().createProject(path.split(/[\\/]/).filter(Boolean).at(-1) || "Project", { kind: "codebase", settings: { agentProjectPath: path } });
        useProjectStore.getState().setActiveProjectId(project.id);
        onProjectPathChange(path);
        setError("");
      }
    } catch (cause) { setError(`Could not open a folder: ${String(cause)}`); }
  };
  return <main className="agent-workspace">
    <section className="agent-main">
      <header className={`flex shrink-0 items-center gap-2 bg-[var(--color-bg)] px-6 ${empty ? "h-16" : "h-14"}`}>
        <div className="agent-breadcrumb"><strong>{active?.title || "New chat"}</strong></div>
        <select aria-label="Project" value={activeProjectId ?? ""} disabled={running} onChange={(event) => selectProject(event.target.value)} className="max-w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs">
          <option value="">No project</option>
          {projects.filter((project) => project.status !== "archived").map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <button className="agent-icon-button flex items-center gap-2 text-xs" disabled={running} onClick={() => void attachProject()} title={projectPath || "Attach a folder to read, edit files, and run commands"}><FolderOpen size={15} />{projectPath.split(/[\\/]/).filter(Boolean).at(-1) || "Attach project"}</button>
        {projectPath && <button className="agent-icon-button" disabled={running} aria-label="Detach project" onClick={() => { selectProject(""); setInspectorOpen(false); }}><X size={14} /></button>}
        {projectPath && <button className="agent-icon-button" onClick={() => setInspectorOpen(!inspectorOpen)} aria-label={inspectorOpen ? "Close inspector" : "Open project inspector"} aria-expanded={inspectorOpen}>{inspectorOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}</button>}
      </header>
      {connection}
      {runtimeAvailable !== true && <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-6 py-3 text-xs text-[var(--color-text-dim)]" role="status">
        <span>{runtimeAvailable === null ? "Checking chat runtime…" : "Pi is unavailable. Install Pi or check that it is on your PATH, then retry."}</span>
        <button className="flex items-center gap-2" onClick={onCheckRuntime}><RefreshCw size={13} />Retry</button>
      </div>}
      {error && <div className="agent-inline-error" role="alert">{error}</div>}
      {!empty && active ? <AgentOutputView key={active.id} session={active} onStop={onStopSession} onFollowUp={onSuggestion} /> : <div className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto px-6 pb-8 pt-8 text-center">
        <h2 className="text-[clamp(24px,3vw,32px)] font-normal leading-tight tracking-tight text-[var(--color-text)]">What's on your mind today?</h2>
      </div>}
      <PiQuestion sessionId={activeSessionId} />
      {composer}
      {empty && <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5">
        <div className="mx-auto flex w-full max-w-[1052px] flex-col gap-1">
          {[
            { icon: FileText, text: "Summarize the document I'm working on" },
            { icon: Folder, text: "Help me plan my next project milestone" },
            { icon: PencilLine, text: "Turn my notes into a clear first draft" },
          ].map(({ icon: Icon, text }) => <button key={text} onClick={() => onSuggestion(text)} className="flex min-h-12 items-center gap-4 rounded-xl px-4 py-2 text-left text-[14px] text-[var(--color-text-dim)] transition-colors hover:bg-white/[.04]"><Icon size={18} className="shrink-0" />{text}</button>)}
        </div>
      </div>}
    </section>
    {inspectorOpen && projectPath && <AgentInspector projectPath={projectPath} session={active} />}
  </main>;
}
