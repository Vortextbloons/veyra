import { useState, type ReactNode } from "react";
import { Bot, FolderOpen, Plus, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Search, ChevronRight, Folder, ArrowUpRight, RefreshCw, TerminalSquare, ListTodo, Code2, Square, Trash2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import type { AgentMode, AgentSession } from "../agent-types";
import { useAgentStore } from "../agent-store";
import { AgentOutputView } from "./agent-output-view";
import { StatusDot } from "../agent-status-dot";
import { AgentInspector } from "./agent-inspector";
import "./agent-workspace.css";

function projectName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || "Default workspace";
}

type AgentsPanelProps = {
  sessions: AgentSession[]; activeSessionId: string | null; runtimeAvailable: boolean | null;
  mode: AgentMode; projectPath: string; onProjectPathChange: (path: string) => void;
  onCheckRuntime: () => void; onNewSession: () => void; onSelectSession: (id: string) => void;
  onStopSession: (id: string) => void; onDeleteSession: (id: string) => void;
  composer: ReactNode; connection: ReactNode; onSuggestion: (text: string) => void;
};

export function AgentsPanel({ sessions, activeSessionId, runtimeAvailable, projectPath, onProjectPathChange, onCheckRuntime, onNewSession, onSelectSession, onStopSession, onDeleteSession, composer, connection, onSuggestion }: AgentsPanelProps) {
  const savedProjects = useAgentStore((state) => state.projects);
  const projects = [...new Set([...savedProjects, ...sessions.map((session) => session.projectPath), projectPath])];
  const active = sessions.find((session) => session.id === activeSessionId) ?? null;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const addProject = async () => {
    try {
      const path = await open({ directory: true, title: "Open agent project" });
      if (typeof path === "string") { onProjectPathChange(path); onNewSession(); setError(""); }
    } catch (cause) { setError(`Could not open a folder: ${String(cause)}`); }
  };
  return <main className="agent-workspace">
    {sidebarOpen && <aside className="agent-projects">
      <div className="agent-sidebar-heading"><span><Bot size={16} />Agents</span><button className="agent-icon-button" onClick={() => setSidebarOpen(false)} aria-label="Collapse projects"><PanelLeftClose size={16} /></button></div>
      <button className="agent-new-task" onClick={onNewSession}><Plus size={15} />New session<span aria-hidden="true">↗</span></button>
      <label className="agent-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a project or session" aria-label="Find a project or session" /></label>
      <div className="agent-section-label">Projects<button className="agent-icon-button" onClick={() => void addProject()} aria-label="Add project"><Plus size={14} /></button></div>
      <nav className="agent-project-tree" aria-label="Agent projects">
        {projects.map((path) => {
          const projectSessions = sessions.filter((session) => session.projectPath === path);
          const match = projectName(path).toLowerCase().includes(query.toLowerCase());
          const visible = projectSessions.filter((session) => match || session.title.toLowerCase().includes(query.toLowerCase()));
          if (!match && visible.length === 0) return null;
          return <div key={path} className="agent-project-group">
            <button className={`agent-project-row ${path === projectPath ? "is-selected" : ""}`} title={path || "Default workspace"} onClick={() => onProjectPathChange(path)}>
              <ChevronRight size={12} className={path === projectPath || query ? "is-expanded" : ""} /><Folder size={15} /><span>{projectName(path)}</span>
              {projectSessions.some((session) => session.status === "running") && <StatusDot status="running" />}
            </button>
            {(path === projectPath || query) && <div className="agent-project-sessions">
              {visible.length === 0 && <p className="agent-no-sessions">Your sessions will appear here</p>}
              {visible.map((session) => <div key={session.id} className={`agent-session-row ${session.id === activeSessionId ? "is-selected" : ""}`}>
                <button className="agent-session-select" onClick={() => onSelectSession(session.id)} title={session.title}><StatusDot status={session.status} /><span>{session.title}</span></button>
                <button className="agent-session-action agent-icon-button" aria-label={session.status === "running" ? `Stop ${session.title}` : `Delete ${session.title}`} onClick={() => {
                  if (session.status === "running") onStopSession(session.id);
                  else if (window.confirm(`Delete session "${session.title}"? This cannot be undone.`)) onDeleteSession(session.id);
                }}>{session.status === "running" ? <Square size={12} /> : <Trash2 size={12} />}</button>
              </div>)}
            </div>}
          </div>;
        })}
      </nav>
      <div className="agent-sidebar-footer"><button onClick={() => void addProject()}><FolderOpen size={15} />Open project</button><button onClick={onCheckRuntime} title="Check agent runtime"><span className={`agent-runtime-dot ${runtimeAvailable ? "is-ready" : ""}`} />{runtimeAvailable === true ? "Runtime ready" : runtimeAvailable === false ? "Runtime unavailable" : "Check runtime"}<RefreshCw size={12} /></button></div>
    </aside>}
    <section className="agent-main">
      <header className="agent-workspace-header">
        {!sidebarOpen && <button className="agent-icon-button" onClick={() => setSidebarOpen(true)} aria-label="Expand projects"><PanelLeftOpen size={16} /></button>}
        <div className="agent-breadcrumb"><span title={projectPath}>{projectName(projectPath)}</span><ChevronRight size={12} /><strong>{active?.title || "New session"}</strong></div>
        <button className="agent-icon-button" onClick={() => setInspectorOpen(!inspectorOpen)} aria-label={inspectorOpen ? "Close inspector" : "Open project inspector"} aria-expanded={inspectorOpen}>{inspectorOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}</button>
      </header>
      {connection}
      {error && <div className="agent-inline-error" role="alert">{error}</div>}
      {active ? <AgentOutputView key={active.id} session={active} onStop={onStopSession} /> : <div className="agent-start">
        <div className="agent-start-content"><div className="agent-start-icon"><TerminalSquare size={25} strokeWidth={1.4} /></div>
          <p className="agent-eyebrow">{projectName(projectPath)}</p><h1>What should we work on?</h1><p className="agent-start-description">Explore the code. Make a plan. Build something better.</p>
          <div className="agent-starters">{[
            { icon: Code2, title: "Explore this project", text: "Inspect this project and explain its architecture, entry points, and development commands." },
            { icon: ListTodo, title: "Plan a change", text: "Help me plan a change to this project. First inspect the code, then ask what I want to build." },
            { icon: TerminalSquare, title: "Review the code", text: "Review this project for correctness issues and missing tests. Report concrete findings with file references." },
          ].map((item) => <button key={item.title} onClick={() => onSuggestion(item.text)}><item.icon size={16} /><span>{item.title}</span><ArrowUpRight size={13} /></button>)}</div>
        </div>
      </div>}
      {composer}
    </section>
    {inspectorOpen && <AgentInspector projectPath={projectPath} session={active} />}
  </main>;
}
