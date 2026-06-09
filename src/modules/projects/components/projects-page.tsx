import { useState } from "react";
import {
  Folder,
  Plus,
  Search,
  Archive,
  MoreHorizontal,
  LayoutGrid,
  GraduationCap,
  Briefcase,
  Code2,
  Palette,
  FlaskConical,
  FolderOpen,
} from "lucide-react";
import { useProjectStore } from "@/modules/projects/project-store";
import type { ProjectKind, ProjectRecord } from "@/modules/projects/project-types";
import { PROJECT_KIND_LABELS } from "@/modules/projects/project-types";
import { ProjectWorkspace } from "./project-workspace";
import { CreateProjectModal } from "./create-project-modal";

const KIND_ICONS: Record<ProjectKind, React.ReactNode> = {
  app: <LayoutGrid className="size-3.5" />,
  class: <GraduationCap className="size-3.5" />,
  client: <Briefcase className="size-3.5" />,
  codebase: <Code2 className="size-3.5" />,
  creative: <Palette className="size-3.5" />,
  research: <FlaskConical className="size-3.5" />,
  general: <Folder className="size-3.5" />,
};

const COLOR_RING: Record<string, string> = {
  indigo: "ring-indigo-500/40 bg-indigo-500/15 text-indigo-300",
  violet: "ring-violet-500/40 bg-violet-500/15 text-violet-300",
  blue: "ring-blue-500/40 bg-blue-500/15 text-blue-300",
  cyan: "ring-cyan-500/40 bg-cyan-500/15 text-cyan-300",
  teal: "ring-teal-500/40 bg-teal-500/15 text-teal-300",
  emerald: "ring-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  amber: "ring-amber-500/40 bg-amber-500/15 text-amber-300",
  orange: "ring-orange-500/40 bg-orange-500/15 text-orange-300",
  rose: "ring-rose-500/40 bg-rose-500/15 text-rose-300",
  pink: "ring-pink-500/40 bg-pink-500/15 text-pink-300",
  slate: "ring-slate-500/40 bg-slate-500/15 text-slate-300",
};

export function ProjectsPage() {
  const { projects, activeProjectId, setActiveProjectId, archiveProject } =
    useProjectStore();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

  const activeProjects = projects.filter(
    (p) => p.status === "active" || p.status === "paused",
  );
  const archivedProjects = projects.filter((p) => p.status === "archived");

  const filteredActive = search
    ? activeProjects.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.description.toLowerCase().includes(search.toLowerCase()),
      )
    : activeProjects;

  const filteredArchived = search
    ? archivedProjects.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.description.toLowerCase().includes(search.toLowerCase()),
      )
    : archivedProjects;

  const selectedProject = projects.find((p) => p.id === activeProjectId) ?? null;

  return (
    <div className="flex h-full min-w-0">
      {/* Left: project list sidebar */}
      <div className="flex w-[260px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-[13px] font-semibold text-[var(--color-text)]">Projects</h2>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:brightness-110"
          >
            <Plus className="size-3.5" />
            New
          </button>
        </div>

        {/* Search - only show when projects exist */}
        {activeProjects.length > 0 && (
          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-dim)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects..."
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] py-2 pl-8 pr-3 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Project list */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {filteredActive.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              active={project.id === activeProjectId}
              onSelect={() => setActiveProjectId(project.id)}
              onArchive={() => archiveProject(project.id)}
            />
          ))}

          {filteredArchived.length > 0 && (
            <>
              <div className="mt-4 mb-1.5 flex items-center gap-1.5 px-2">
                <Archive className="size-3 text-[var(--color-text-dim)]" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
                  Archived
                </span>
              </div>
              {filteredArchived.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  active={project.id === activeProjectId}
                  onSelect={() => setActiveProjectId(project.id)}
                  onArchive={() => archiveProject(project.id)}
                />
              ))}
            </>
          )}

          {/* Empty state */}
          {activeProjects.length === 0 && !search && (
            <div className="px-2 pt-8 text-center">
              <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-[var(--color-accent-soft)]">
                <FolderOpen className="size-6 text-[var(--color-accent)]" />
              </div>
              <p className="text-[13px] font-medium text-[var(--color-text)]">
                No projects yet
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-dim)]">
                Create your first project to group chats, memories, documents, and settings together.
              </p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-[12px] font-medium text-white transition-colors hover:brightness-110"
              >
                <Plus className="size-3.5" />
                Create Project
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main: workspace or onboarding */}
      <div className="min-w-0 flex-1 overflow-hidden">
        {selectedProject ? (
          <ProjectWorkspace project={selectedProject} />
        ) : (
          <ProjectOnboarding onCreateClick={() => setShowCreate(true)} />
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateProjectModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

function ProjectRow({
  project,
  active,
  onSelect,
  onArchive,
}: {
  project: ProjectRecord;
  active: boolean;
  onSelect: () => void;
  onArchive: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const colorClass = COLOR_RING[project.color] ?? COLOR_RING.indigo;

  return (
    <div className="relative">
      <div
        onClick={onSelect}
        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
          active
            ? "bg-[var(--color-accent-soft)]"
            : "hover:bg-white/[0.03]"
        }`}
      >
        <div className={`grid size-8 shrink-0 place-items-center rounded-lg ring-1 ${colorClass}`}>
          {KIND_ICONS[project.kind] ?? KIND_ICONS.general}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`truncate text-[13px] font-medium ${active ? "text-white" : "text-[var(--color-text)]"}`}>
            {project.name}
          </div>
          <div className="truncate text-[11px] text-[var(--color-text-dim)]">
            {PROJECT_KIND_LABELS[project.kind]}
            {project.systemPrompt ? " · has prompt" : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="grid size-7 shrink-0 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </div>
      {showMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
          <div className="absolute right-2 top-full z-20 min-w-[140px] rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] py-1 shadow-xl">
            <button
              type="button"
              onClick={() => {
                onArchive();
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            >
              <Archive className="size-3.5" />
              Archive
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ProjectOnboarding({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="mx-auto max-w-md px-8 text-center">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-[var(--color-accent-soft)]">
          <Folder className="size-8 text-[var(--color-accent)]" />
        </div>
        <h2 className="text-[18px] font-semibold text-[var(--color-text)]">
          Select or create a project
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-text-dim)]">
          Projects let you group chats, memories, documents, and settings together
          around a goal, app, codebase, or creative idea.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onCreateClick}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-[13px] font-medium text-white transition-colors hover:brightness-110"
          >
            <Plus className="size-4" />
            Create Project
          </button>
        </div>
        <div className="mt-8 grid grid-cols-3 gap-3 text-left">
          <FeatureCard icon="💬" title="Chats" desc="Project-scoped conversations" />
          <FeatureCard icon="📝" title="Documents" desc="Notes, specs, and files" />
          <FeatureCard icon="🧠" title="Memory" desc="Project-specific knowledge" />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
      <div className="mb-1.5 text-[18px]">{icon}</div>
      <div className="text-[12px] font-medium text-[var(--color-text)]">{title}</div>
      <div className="text-[10.5px] text-[var(--color-text-dim)]">{desc}</div>
    </div>
  );
}

export default ProjectsPage;
