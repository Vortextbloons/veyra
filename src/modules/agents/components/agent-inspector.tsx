import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileCode2, Folder, ArrowLeft, RefreshCw } from "lucide-react";
import type { AgentSession } from "../agent-types";

type Listing = { entries: { name: string; directory: boolean }[]; content: string | null; truncated: boolean };

export function AgentInspector({ projectPath, session }: { projectPath: string; session: AgentSession | null }) {
  const [tab, setTab] = useState<"files" | "activity">("files");
  return <aside className="agent-inspector">
    <div className="agent-inspector-tabs" role="tablist" aria-label="Project inspector">
      <button role="tab" aria-selected={tab === "files"} onClick={() => setTab("files")}>Files</button>
      <button role="tab" aria-selected={tab === "activity"} onClick={() => setTab("activity")}>Activity</button>
    </div>
    {tab === "files" ? <WorkspaceFiles key={projectPath} projectPath={projectPath} /> : <div className="agent-inspector-scroll">
      <div className="agent-session-facts"><span>Session</span><strong>{session?.status ?? "Not started"}</strong><span>Mode</span><strong>{session?.mode ?? "—"}</strong><span>Context tokens</span><strong>{session?.contextTokens?.toLocaleString() ?? "—"}</strong></div>
      <p className="agent-section-label">Tool activity</p>
      {!session?.events.some((event) => event.type === "tool") && <p className="agent-inspector-empty">File reads, commands, and edits will appear here when the agent uses tools.</p>}
      {session?.events.filter((event) => event.type === "tool").map((event) => <details key={event.id} className="agent-tool-log"><summary>{event.title}<time>{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></summary><pre>{event.detail || "Running tool…"}</pre></details>)}
    </div>}
  </aside>;
}

function WorkspaceFiles({ projectPath }: { projectPath: string }) {
  const [path, setPath] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    invoke<Listing>("inspect_agent_workspace", { projectPath, relativePath: path }).then((value) => {
      if (!cancelled) { setListing(value); setError(""); setLoading(false); }
    }).catch((cause) => {
      if (!cancelled) { setError(String(cause)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [projectPath, path, refresh]);
  const navigate = (next: string) => { setLoading(true); setListing(null); setError(""); setPath(next); };
  return <>
    <div className="agent-file-toolbar"><button className="agent-icon-button" disabled={!path} aria-label="Parent folder" onClick={() => navigate(path.split("/").slice(0, -1).join("/"))}><ArrowLeft size={14} /></button><span title={path}>{path || "Project root"}</span><button className="agent-icon-button" aria-label="Refresh files" onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}><RefreshCw size={14} /></button></div>
    <div className="agent-inspector-scroll">
      {loading ? <p className="agent-inspector-empty">Reading project…</p> : error ? <p className="agent-inline-error" role="alert">{error}</p> : listing?.content != null ? <pre className="agent-file-preview">{listing.content || "Empty file"}</pre> : <div className="agent-file-list">
        {listing?.entries.map((entry) => <button key={entry.name} onClick={() => navigate([path, entry.name].filter(Boolean).join("/"))}>{entry.directory ? <Folder size={14} /> : <FileCode2 size={14} />}<span>{entry.name}</span></button>)}
        {listing?.entries.length === 0 && <p className="agent-inspector-empty">This folder is empty.</p>}
      </div>}
      {!loading && listing?.truncated && <p className="agent-inspector-empty">Preview limited. Ask the agent to inspect more.</p>}
    </div>
  </>;
}
