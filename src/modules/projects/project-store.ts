import { create } from "zustand";
import { notifyMemoryDeletion } from "@/modules/memory/memory-lifecycle";
import { useChatStore } from "@/stores/chat-store";
import { flushConversationSave, getConversationStorageIssue, saveConversationSnapshot } from "@/lib/conversation-storage";
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

  // ── Derived ────────────────────────────────────────────────────────────────
  activeProject: () => ProjectRecord | null;
  activeProjects: () => ProjectRecord[];
  archivedProjects: () => ProjectRecord[];
};

let hydratePromise: Promise<void> | null = null;

/**
 * The agent runtime scopes sessions by workspace path, while memories and
 * skills are scoped by project id. `resolveAgentProjectId` maps one to the
 * other through this field, so it has to stay in sync with the directory
 * resource the user attached.
 */
function withAgentProjectPath(settings: ProjectSettings): ProjectSettings {
  const directory = settings.resources?.find((resource) => resource.directory)?.path;
  if (!directory) {
    const { agentProjectPath: _removed, ...rest } = settings;
    return rest;
  }
  return { ...settings, agentProjectPath: directory };
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  hydrationState: "loading",

  hydrateProjects: async () => {
    if (get().hydrationState === "ready") return;
    hydratePromise ??= (async () => {
      const allProjects = await listProjects();
      const legacy = allProjects.filter((project) => project.settings.projectSystemVersion !== 2);
      const projects = allProjects.filter((project) => project.settings.projectSystemVersion === 2);
      if (legacy.length && useChatStore.getState().hydrationState === "ready" && getConversationStorageIssue()?.severity !== "error") {
        const ids = new Set(legacy.map((project) => project.id));
        const conversations = useChatStore.getState().conversations.map((conversation) => ({
          ...conversation,
          projectId: conversation.projectId && ids.has(conversation.projectId) ? undefined : conversation.projectId,
          agentSession: conversation.agentSession && conversation.agentSession.projectId && ids.has(conversation.agentSession.projectId)
            ? { ...conversation.agentSession, projectId: undefined }
            : conversation.agentSession,
        }));
        useChatStore.setState({ conversations });
        void saveConversationSnapshot(conversations);
        await flushConversationSave();
        if (getConversationStorageIssue()?.severity !== "error") {
          await Promise.all(legacy.map((project) => deleteProjectApi(project.id)));
        }
      }
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

  createProject: async (name, options) => {
    const project = await createProjectApi({
      name,
      description: options?.description,
      kind: options?.kind as ProjectKind | undefined,
      color: options?.color,
      icon: options?.icon,
      systemPrompt: options?.systemPrompt,
      settings: withAgentProjectPath({
        ...options?.settings,
        projectSystemVersion: 2,
        resources: options?.settings?.resources ?? [],
      }),
    });
    set((state) => ({
      projects: [project, ...state.projects],
      activeProjectId: project.id,
    }));
    return project;
  },

  updateProject: async (id, changes) => {
    const now = new Date().toISOString();
    const settings = changes.settings ? withAgentProjectPath(changes.settings) : undefined;
    const project = await updateProjectApi({
      id,
      name: changes.name,
      description: changes.description,
      kind: changes.kind as ProjectKind | undefined,
      status: changes.status,
      color: changes.color,
      icon: changes.icon,
      systemPrompt: changes.systemPrompt,
      settings,
      updatedAt: now,
    });
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? project : p)),
    }));
    return project;
  },

  deleteProject: async (id) => {
    await deleteProjectApi(id);
    notifyMemoryDeletion({ projectId: id });
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
