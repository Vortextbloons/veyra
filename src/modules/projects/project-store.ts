import { create } from "zustand";
import type {
  ProjectRecord,
  ProjectKind,
  ProjectSettings,
  ProjectStatus,
} from "@/modules/projects/project-types";
import {
  listProjects,
  createProject as createProjectApi,
  updateProject as updateProjectApi,
  deleteProject as deleteProjectApi,
} from "@/modules/projects/project-storage";

type ProjectStore = {
  /** All loaded projects (active + paused + archived). */
  projects: ProjectRecord[];
  /** Currently selected project id. */
  activeProjectId: string | null;
  /** Hydration state. */
  hydrationState: "loading" | "ready";

  // ── Hydration ──────────────────────────────────────────────────────────────
  hydrateProjects: () => Promise<void>;

  // ── Selection ──────────────────────────────────────────────────────────────
  setActiveProjectId: (id: string | null) => void;
  clearActiveProject: () => void;

  // ── CRUD ───────────────────────────────────────────────────────────────────
  createProject: (name: string, options?: {
    description?: string;
    kind?: string;
    color?: string;
    icon?: string;
    systemPrompt?: string;
    settings?: ProjectSettings;
  }) => Promise<ProjectRecord>;
  updateProject: (id: string, changes: Partial<{
    name: string;
    description: string;
    kind: string;
    status: ProjectStatus;
    color: string;
    icon: string;
    systemPrompt: string;
    settings: ProjectSettings;
  }>) => Promise<ProjectRecord>;
  deleteProject: (id: string) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
  openProject: (id: string) => void;

  // ── Derived ────────────────────────────────────────────────────────────────
  activeProject: () => ProjectRecord | null;
  activeProjects: () => ProjectRecord[];
  archivedProjects: () => ProjectRecord[];
};

let hydratePromise: Promise<void> | null = null;

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  hydrationState: "loading",

  hydrateProjects: async () => {
    if (get().hydrationState === "ready") return;
    hydratePromise ??= (async () => {
      const projects = await listProjects();
      set({
        projects,
        hydrationState: "ready",
      });
    })().finally(() => {
      hydratePromise = null;
    });
    await hydratePromise;
  },

  setActiveProjectId: (id) => set({ activeProjectId: id }),
  clearActiveProject: () => set({ activeProjectId: null }),

  createProject: async (name, options) => {
    const project = await createProjectApi({
      name,
      description: options?.description,
      kind: options?.kind as ProjectKind | undefined,
      color: options?.color,
      icon: options?.icon,
      systemPrompt: options?.systemPrompt,
      settings: options?.settings,
    });
    set((state) => ({
      projects: [project, ...state.projects],
      activeProjectId: project.id,
    }));
    return project;
  },

  updateProject: async (id, changes) => {
    const now = new Date().toISOString();
    const project = await updateProjectApi({
      id,
      name: changes.name,
      description: changes.description,
      kind: changes.kind as ProjectKind | undefined,
      status: changes.status,
      color: changes.color,
      icon: changes.icon,
      systemPrompt: changes.systemPrompt,
      settings: changes.settings,
      updatedAt: now,
    });
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? project : p)),
    }));
    return project;
  },

  deleteProject: async (id) => {
    await deleteProjectApi(id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
    }));
  },

  archiveProject: async (id) => {
    const now = new Date().toISOString();
    const project = await updateProjectApi({ id, status: "archived", updatedAt: now });
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? project : p)),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
    }));
  },

  openProject: (id) => {
    const now = new Date().toISOString();
    set({ activeProjectId: id });
    // Fire and forget — update lastOpenedAt
    void updateProjectApi({ id, lastOpenedAt: now, updatedAt: now }).then((updated) => {
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
      }));
    });
  },

  activeProject: () => {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId) ?? null;
  },

  activeProjects: () => {
    return get().projects.filter((p) => p.status === "active" || p.status === "paused");
  },

  archivedProjects: () => {
    return get().projects.filter((p) => p.status === "archived");
  },
}));
