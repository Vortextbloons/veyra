import { useState } from "react";
import {
  Folder,
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
  const handleArchiveProject = (project: ProjectRecord) => {
    if (window.confirm(`Archive project "${project.name}"?`)) {
      void archiveProject(project.id);
    }
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-1">
      {/* Left: project list sidebar */}
      {projects.length > 0 && <div className="flex w-[260px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-[13px] font-semibold text-[var(--color-text)]">Projects</h2>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:brightness-110"
          >
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
              onArchive={() => handleArchiveProject(project)}
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
                  onArchive={() => handleArchiveProject(project)}
                />
              ))}
            </>
          )}

          {search && filteredActive.length === 0 && filteredArchived.length === 0 && (
            <div className="px-4 py-8 text-center">
              <Search className="mx-auto mb-2 size-5 text-[var(--color-text-dim)]/60" />
              <p className="text-[13px] font-medium text-[var(--color-text)]">No matching projects</p>
              <p className="mt-1 text-[12px] text-[var(--color-text-dim)]">
                Try a different name or description.
              </p>
            </div>
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
            </div>
          )}
        </div>
      </div>}

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
      <div className={`flex w-full items-center rounded-lg transition-colors ${
          active
            ? "bg-[var(--color-accent-soft)]"
            : "hover:bg-white/[0.03]"
        }`}>
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left"
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
      </button>
        <button
          type="button"
          aria-label={`Project actions for ${project.name}`}
          aria-haspopup="menu"
          aria-expanded={showMenu}
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="mr-1 grid size-8 shrink-0 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </div>
      {showMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
          <div role="menu" className="absolute right-2 top-full z-20 min-w-[140px] rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] py-1 shadow-xl">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onArchive();
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            >
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
    <div className="flex h-full items-center justify-center p-10">
      <div className="w-full max-w-xl">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
          Projects
        </p>
        <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.035em] text-[var(--color-text)]">
          Keep related work in one place.
        </h2>
        <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-[var(--color-text-dim)]">
          Group conversations, documents, memory, and instructions around a product, client, class, or creative goal.
        </p>
        <div className="mt-7">
          <button
            type="button"
            onClick={onCreateClick}
            className="flex min-h-9 items-center gap-2 rounded-md bg-[var(--color-accent)] px-4 text-[13px] font-medium text-white transition-colors hover:brightness-110"
          >
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProjectsPage;
