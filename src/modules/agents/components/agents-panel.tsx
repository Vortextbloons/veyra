import { useState, type ReactNode } from "react";
import { FolderOpen, PanelRightClose, PanelRightOpen, RefreshCw, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import type { AgentMode, AgentSession } from "../agent-types";
import { AgentOutputView } from "./agent-output-view";
import { AgentInspector } from "./agent-inspector";
import "./agent-workspace.css";
import { PiQuestion } from "../pi-questions";
import { useProjectStore } from "@/modules/projects/project-store";
import { useAgentStore } from "../agent-store";
import { resolveAgentProjectId } from "../agent-session-context";

type AgentsPanelProps = {
  sessions: AgentSession[]; activeSessionId: string | null; runtimeAvailable: boolean | null;
  mode: AgentMode; projectPath: string; onProjectPathChange: (path: string) => void;
  onCheckRuntime: () => void; onNewSession: () => void; onSelectSession: (id: string) => void;
  onStopSession: (id: string) => void; onDeleteSession: (id: string) => void;
  composer: ReactNode; connection: ReactNode; onSuggestion: (text: string) => void;
};

export function AgentsPanel({ sessions, activeSessionId, runtimeAvailable, projectPath, onProjectPathChange, onCheckRuntime, onStopSession, composer, connection, onSuggestion }: AgentsPanelProps) {
  const active = sessions.find((session) => session.id === activeSessionId) ?? null;
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
      <header className="agent-workspace-header">
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
      {active ? <AgentOutputView key={active.id} session={active} onStop={onStopSession} onFollowUp={onSuggestion} /> : <div className="agent-start">
        <div className="agent-start-content"><h1>What’s on your mind?</h1><p className="agent-start-description">Ask a question, explore an idea, or work on a project.</p>
          <div className="agent-starters">{[
            { title: "Think through an idea", text: "Help me think through an idea. Ask me what I have in mind." },
            { title: "Find an answer", text: "Help me research a question. Ask me what I want to find out." },
            { title: "Work on a project", text: projectPath ? "Explore this project and briefly explain what it does and how to run it." : "Help me work on a project. Ask me what I want to make or change." },
          ].map((item) => <button key={item.title} onClick={() => onSuggestion(item.text)}>{item.title}</button>)}</div>
        </div>
      </div>}
      <PiQuestion sessionId={activeSessionId} />
      {composer}
    </section>
    {inspectorOpen && projectPath && <AgentInspector projectPath={projectPath} session={active} />}
  </main>;
}
