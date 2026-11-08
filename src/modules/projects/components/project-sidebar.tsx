import { createPortal } from "react-dom";
import { ConfirmDangerModal } from "@/components/confirm-danger-modal";
import { CreateProjectModal } from "./create-project-modal";
import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronDown, ChevronRight, File, Folder, FolderOpen, FolderPlus, Plus, Trash2 } from "lucide-react";
import { useProjectStore } from "@/modules/projects/project-store";
import { useChatStore } from "@/stores/chat-store";
import { useAgentStore } from "@/modules/agents/agent-store";
import type { ProjectRecord } from "@/modules/projects/project-types";

type Resource = { path: string; directory: boolean };
type Listing = { entries: { name: string; directory: boolean }[]; content: string | null; truncated: boolean };
const label = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

export function ProjectSidebar({ onOpenChat, onNewProjectChat }: { onOpenChat: (id: string) => void; onNewProjectChat: (id: string, workspacePath?: string) => void }) {
  const projects = useProjectStore((state) => state.projects);
  const create = useProjectStore((state) => state.createProject);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const closeCreate = useCallback(() => setCreating(false), []);
  return <section className="shrink-0 px-3 max-[760px]:hidden" aria-label="Projects">
    <div className="flex items-center justify-between px-2 py-2 text-[13px] font-medium text-[var(--color-text-dim)]"><span>Projects</span><div className="flex items-center gap-1"><button type="button" aria-label="Open folder as project" title="Open folder as project" className="rounded p-1 hover:bg-white/10 hover:text-white" onClick={() => void (async () => { try { const path = await open({ directory: true, title: "Open folder as project" }); if (typeof path !== "string") return; const existing = useProjectStore.getState().projects.find((project) => project.settings.resources?.some((resource) => resource.directory && resource.path === path)); const project = existing ?? await create(label(path), { settings: { resources: [{ path, directory: true }] } }); setExpanded((current) => current.includes(project.id) ? current : [...current, project.id]); onNewProjectChat(project.id, path); setError(""); } catch (cause) { setError(String(cause)); } })()}><FolderOpen size={16} /></button><button type="button" aria-label="New project" title="New project" className="rounded p-1 hover:bg-white/10 hover:text-white" onClick={() => setCreating(true)}><FolderPlus size={16} /></button></div></div>
    {creating && <CreateProjectModal onClose={closeCreate} onCreated={(project) => {
      setExpanded((current) => [...current, project.id]);
      setCreating(false);
    }} />}
    {error && <p role="alert" className="px-2 text-xs text-red-300">{error}</p>}
    <div className="max-h-[38vh] overflow-y-auto">{projects.filter((p) => p.status === "active").map((project) => <ProjectRow key={project.id} project={project} expanded={expanded.includes(project.id)} onToggle={() => setExpanded((items) => items.includes(project.id) ? items.filter((id) => id !== project.id) : [...items, project.id])} onOpenChat={onOpenChat} onNewProjectChat={onNewProjectChat} />)}</div>
  </section>;
}

function ProjectRow({ project, expanded, onToggle, onOpenChat, onNewProjectChat }: { project: ProjectRecord; expanded: boolean; onToggle: () => void; onOpenChat: (id: string) => void; onNewProjectChat: (id: string) => void }) {
  const conversations = useChatStore((state) => state.conversations);
  const update = useProjectStore((state) => state.updateProject);
  const remove = useProjectStore((state) => state.deleteProject);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const cancelDelete = useCallback(() => setDeleting(false), []);
  const [error, setError] = useState("");
  const resources = project.settings.resources ?? [];
  const add = async (directory: boolean) => {
    try {
      const selected = await open({ directory, multiple: true, title: directory ? "Attach folders" : "Attach files" });
      const paths = typeof selected === "string" ? [selected] : selected ?? [];
      if (paths.length) await update(project.id, { settings: { ...project.settings, resources: [...resources, ...paths.filter((path) => !resources.some((item) => item.path === path)).map((path) => ({ path, directory }))] } });
      setError("");
    } catch (cause) { setError(String(cause)); }
  };
  return <div className="text-[13px]"><div className="group flex items-center rounded hover:bg-white/5"><button type="button" aria-expanded={expanded} onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1.5 text-left">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<Folder size={15} className="text-[var(--color-accent)]" /><span className="truncate">{project.name}</span></button><button type="button" title="New chat in project" aria-label={`New chat in ${project.name}`} onClick={() => onNewProjectChat(project.id)} className="flex shrink-0 items-center gap-1 rounded px-2 py-1.5 text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"><Plus size={15} /><span className="text-[11px]">New chat</span></button></div>
    {deleting && createPortal(<ConfirmDangerModal open title={`Delete project "${project.name}"?`} description={<span>Chats and original files will be kept. The project grouping and its instructions will be removed.{deleteError && <span role="alert" className="mt-2 block text-red-300">{deleteError}</span>}</span>} confirmLabel="Delete project" onCancel={cancelDelete} onConfirm={async () => {
      if (useAgentStore.getState().sessions.some((session) => session.projectId === project.id && session.status === "running")) {
        setDeleteError("Wait for this project's response to finish before deleting it.");
        return;
      }
      try {
        await remove(project.id);
        const state = useAgentStore.getState();
        useAgentStore.setState({ sessions: state.sessions.map((session) => session.projectId === project.id ? { ...session, projectId: undefined } : session) });
        useChatStore.getState().clearProject(project.id);
      } catch (cause) { setDeleteError(String(cause)); }
    }} />, document.body)}
    {expanded && <div className="ml-4 border-l border-white/10 pl-2">
      {conversations.filter((chat) => chat.projectId === project.id).map((chat) => <button key={chat.id} type="button" onClick={() => onOpenChat(chat.id)} className="block w-full truncate rounded px-2 py-1.5 text-left text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white">{chat.title}</button>)}
      {resources.map((resource) => <ResourceTree key={resource.path} resource={resource} onRemove={() => void update(project.id, { settings: { ...project.settings, resources: resources.filter((item) => item.path !== resource.path) } }).catch((cause) => setError(String(cause)))} />)}
      <div className="flex flex-wrap gap-2 px-2 py-1 text-[11px] text-[var(--color-text-dim)]"><button onClick={() => void add(false)} className="hover:text-white">+ File</button><button onClick={() => void add(true)} className="hover:text-white">+ Folder</button><button onClick={() => { const name = window.prompt("Project name", project.name)?.trim(); if (name && name !== project.name) void update(project.id, { name }).catch((cause) => setError(String(cause))); }} className="hover:text-white">Rename</button><button onClick={() => { setDeleteError(""); setDeleting(true); }} className="hover:text-red-300">Delete</button></div>
      {error && <p role="alert" className="px-2 text-xs text-red-300">{error}</p>}
    </div>}
  </div>;
}

function ResourceTree({ resource, onRemove }: { resource: Resource; onRemove: () => void }) {
  const [path, setPath] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState(false);
  const addFile = (relativePath: string) => window.dispatchEvent(new CustomEvent("veyra:attach-project-file", { detail: { rootPath: resource.path, relativePath, name: label(relativePath || resource.path) } }));
  const browse = async (next: string) => { try { const result = await invoke<Listing>("inspect_project_resource", { rootPath: resource.path, relativePath: next }); setPath(next); setListing(result); setOpened(true); setError(""); } catch (cause) { setError(String(cause)); } };
  return <div><div className="group flex items-center"><button type="button" title={resource.path} onClick={() => opened ? setOpened(false) : void browse("")} className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-1 text-left text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white">{resource.directory ? <Folder size={13} /> : <File size={13} />}<span className="truncate">{label(resource.path)}</span></button>{!resource.directory && <button type="button" aria-label={`Add ${label(resource.path)} to chat`} onClick={() => addFile("")} className="p-1 text-[var(--color-accent)]"><Plus size={13} /></button>}<button type="button" aria-label={`Remove ${label(resource.path)} from project`} onClick={onRemove} className="p-1 text-[var(--color-text-dim)] hover:text-red-300"><Trash2 size={12} /></button></div>
    {opened && <div className="ml-3 border-l border-white/10 pl-2 text-xs">{path && <button className="block px-1 py-1 text-[var(--color-text-dim)]" onClick={() => void browse(path.split("/").slice(0, -1).join("/"))}>← Back</button>}{listing?.content != null ? <><button className="px-1 py-1 text-[var(--color-accent)]" onClick={() => addFile(path)}>Add {label(path || resource.path)} to chat</button><pre className="max-h-24 overflow-auto whitespace-pre-wrap text-[10px] text-[var(--color-text-dim)]">{listing.content}</pre></> : listing?.entries.map((entry) => <div key={entry.name} className="flex items-center"><button onClick={() => void browse([path, entry.name].filter(Boolean).join("/"))} className="flex min-w-0 flex-1 items-center gap-1 truncate px-1 py-1 text-left text-[var(--color-text-dim)] hover:text-white">{entry.directory ? <Folder size={12} /> : <File size={12} />}<span className="truncate">{entry.name}</span></button>{!entry.directory && <button type="button" aria-label={`Add ${entry.name} to chat`} onClick={() => addFile([path, entry.name].filter(Boolean).join("/"))} className="p-1 text-[var(--color-accent)]"><Plus size={12} /></button>}</div>)}{listing?.truncated && <p>Listing or preview truncated.</p>}</div>}{error && <p role="alert" className="px-2 text-xs text-red-300">{error}</p>}</div>;
}
