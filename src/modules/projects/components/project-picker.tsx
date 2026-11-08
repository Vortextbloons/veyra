import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Folder, FolderPlus, Search } from "lucide-react";
import { useClickOutside } from "@/hooks/use-click-outside";
import type { ProjectRecord } from "../project-types";
import { CreateProjectModal } from "./create-project-modal";

export function ProjectPicker({ value, projects, disabled, onChange }: {
  value?: string; projects: ProjectRecord[]; disabled?: boolean; onChange: (id: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const current = projects.find((project) => project.id === value);
  const close = useCallback(() => { setOpen(false); setQuery(""); }, []);
  const closeCreate = useCallback(() => setCreating(false), []);
  useClickOutside(ref, open, close);
  useEffect(() => { if (open) search.current?.focus(); }, [open]);
  const choose = (next?: string) => {
    if (disabled) return;
    onChange(next);
    close();
    trigger.current?.focus();
  };
  const visible = projects.filter((project) => project.status === "active" && project.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <div ref={ref} className="relative min-w-0">
    <button ref={trigger} type="button" disabled={disabled} aria-label={`Chat project: ${current?.name ?? "No project"}`} aria-haspopup="dialog" aria-expanded={open && !disabled} aria-controls={open ? id : undefined} onClick={() => setOpen((previous) => !previous)} className="flex h-8 max-w-60 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white/[0.02] px-2.5 text-xs text-[var(--color-text)] transition-colors hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50">
      <Folder size={14} className={current ? "shrink-0 text-[var(--color-accent)]" : "shrink-0 text-[var(--color-text-dim)]"} /><span className="truncate">{current?.name ?? "No project"}</span><ChevronDown size={12} className={`shrink-0 text-[var(--color-text-dim)] ${open ? "rotate-180" : ""}`} />
    </button>
    {open && !disabled && <div id={id} role="dialog" aria-label="Choose chat project" onKeyDown={(event) => {
      if (event.key === "Escape") { close(); trigger.current?.focus(); }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-project-option]"));
      const index = options.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "ArrowDown" ? (index + 1) % options.length : (index <= 0 ? options.length - 1 : index - 1);
      options[next]?.focus();
      event.preventDefault();
    }} className="absolute bottom-full left-0 z-50 mb-2 w-72 max-w-[calc(100vw-48px)] overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2.5"><Search size={14} className="shrink-0 text-[var(--color-text-dim)]" /><input ref={search} aria-label="Search projects" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects..." className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-[var(--color-text-dim)]" /></div>
      <div className="max-h-60 overflow-y-auto p-1.5">
        <button type="button" data-project-option aria-pressed={!value} onClick={() => choose()} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${!value ? "bg-[var(--color-accent-soft)]" : ""}`}><Folder size={15} className="text-[var(--color-text-dim)]" /><span className="flex-1">No project</span>{!value && <Check size={14} className="text-[var(--color-accent)]" />}</button>
        {visible.map((project) => <button key={project.id} type="button" data-project-option aria-pressed={value === project.id} onClick={() => choose(project.id)} className={`mt-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${value === project.id ? "bg-[var(--color-accent-soft)]" : ""}`}><Folder size={15} className="shrink-0 text-[var(--color-accent)]" /><span className="min-w-0 flex-1"><span className="block truncate text-xs text-[var(--color-text)]">{project.name}</span><span className="mt-0.5 block truncate text-[10px] text-[var(--color-text-dim)]" title={project.settings.agentProjectPath}>{project.settings.agentProjectPath || project.description || "Chats and shared instructions"}</span></span>{value === project.id && <Check size={14} className="shrink-0 text-[var(--color-accent)]" />}</button>)}
        {visible.length === 0 && <p className="px-2.5 py-3 text-xs text-[var(--color-text-dim)]">{query ? "No matching projects" : "Create a project to organize your chats."}</p>}
      </div>
      <div className="border-t border-[var(--color-border)] p-1.5"><button type="button" onClick={() => { close(); setCreating(true); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"><FolderPlus size={15} />Create project</button></div>
    </div>}
    {creating && <CreateProjectModal onClose={closeCreate} onCreated={(project) => { choose(project.id); setCreating(false); }} />}
  </div>;
}
