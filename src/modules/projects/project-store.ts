import { create } from "zustand";
import { notifyMemoryDeletion } from "@/modules/memory/memory-lifecycle";
import { useChatStore } from "@/stores/chat-store";
import { flushConversationSave, getConversationStorageIssue, saveConversationSnapshot } from "@/lib/conversation-storage";
import type {
  ProjectRecord,
  ProjectKind,
  ProjectLockState,
  ProjectSettings,
  ProjectStatus,
} from "@/modules/projects/project-types";
import {
  listProjects,
  createProject as createProjectApi,
  updateProject as updateProjectApi,
  deleteProject as deleteProjectApi,
  readLockedProjectContent,
  writeLockedProjectContent,
} from "@/modules/projects/project-storage";
import {
  registerLockedProjectIds,
  markProjectLocked,
  forgetLockedProject,
} from "@/modules/projects/locked-project-storage";
import {
  lockProjectAndConceal,
  lockAllProjectsAndConceal,
} from "@/modules/projects/locked-project-controller";
import { useVaultSessionStore } from "@/modules/projects/vault-session-store";
import { deleteLockedProject, enableProjectLock } from "@/lib/project-vault";
import { readLockedMemories, saveLockedMemories } from "@/modules/projects/locked-project-storage";
import { useMemoryStore } from "@/modules/memory/memory-store";

type LockOptions = {
  /** Required, and irreversible: there is no recovery path. */
  password: string;
};

type ProjectStore = {
  /** All loaded projects (active + paused + archived). */
  projects: ProjectRecord[];
  /** Currently selected project id. */
  activeProjectId: string | null;
  /** Hydration state. */
  hydrationState: "loading" | "ready";

  // ── Hydration ──────────────────────────────────────────────────────────────
  hydrateProjects: () => Promise<void>;
  /** Loads a locked project's real details after it is unlocked. */
  absorbUnlockedProject: (projectId: string) => Promise<void>;

  // ── Selection ──────────────────────────────────────────────────────────────
  setActiveProjectId: (id: string | null) => void;
  /** Leaves the active project, locking it when it is lock-enabled. */
  leaveActiveProject: (reason?: "navigation" | "user" | "manual") => Promise<void>;

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

  // ── Locking ────────────────────────────────────────────────────────────────
  /** Turns an existing project into a password-locked vault. */
  enableLock: (id: string, options: LockOptions) => Promise<void>;
  /** Locks the project immediately and clears its content from the UI. */
  lockNow: (id: string) => Promise<void>;
  /** Locks every unlocked project (quit, OS lock, suspend). */
  lockAll: () => Promise<void>;
  /** Deletes a locked project, destroying its vault instead of detaching chats. */
  deleteLockedProject: (id: string, password: string) => Promise<void>;

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

function lockStateOf(project: ProjectRecord): ProjectLockState {
  return project.lockState === "locked" ? "locked" : "none";
}

function isLockEnabled(project: ProjectRecord | undefined): boolean {
  return Boolean(project && lockStateOf(project) === "locked");
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
      // Register which projects own vaults before any conversation or memory is
      // persisted, so shared snapshots never carry protected content.
      registerLockedProjectIds(
        allProjects.filter(isLockEnabled).map((project) => project.id),
      );
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

  absorbUnlockedProject: async (projectId) => {
    const generation = useVaultSessionStore.getState().generationFor(projectId);
    if (generation == null) return;
    const content = await readLockedProjectContent(projectId, generation);
    if (!content) return;
    set((state) => ({
      projects: state.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              name: content.name,
              description: content.description,
              kind: content.kind as ProjectKind,
              color: content.color,
              icon: content.icon,
              systemPrompt: content.systemPrompt,
              settings: content.settings ?? {},
              lockState: "locked",
            }
          : project,
      ),
    }));
    try {
      const memories = await readLockedMemories(projectId);
      useMemoryStore.getState().absorbLockedMemories(projectId, memories);
    } catch {
      // Unreadable memories are a non-fatal gap; the project itself is usable.
    }
  },

  setActiveProjectId: (id) => set({ activeProjectId: id }),

  leaveActiveProject: async (reason = "navigation") => {
    const activeId = get().activeProjectId;
    if (!activeId) return;
    const project = get().projects.find((item) => item.id === activeId);
    if (isLockEnabled(project) && useVaultSessionStore.getState().isUnlocked(activeId)) {
      // Locking is the whole point of leaving a protected project: the key is
      // dropped, so coming back always requires the password again.
      await lockProjectAndConceal(activeId, reason);
    }
    if (get().activeProjectId === activeId) set({ activeProjectId: null });
  },

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
    const existing = get().projects.find((project) => project.id === id);
    if (isLockEnabled(existing)) {
      // A locked project's details are vault-owned. Write the whole content
      // record while the project is unlocked, then refresh the in-memory copy.
      const generation = useVaultSessionStore.getState().generationFor(id);
      if (generation == null) {
        throw new Error("Unlock this project to change its details.");
      }
      const current = existing as ProjectRecord;
      const settings = changes.settings ? withAgentProjectPath(changes.settings) : current.settings;
      await writeLockedProjectContent(id, generation, {
        name: changes.name ?? current.name,
        description: changes.description ?? current.description,
        kind: changes.kind ?? current.kind,
        color: changes.color ?? current.color,
        icon: changes.icon ?? current.icon,
        systemPrompt: changes.systemPrompt ?? current.systemPrompt,
        settings,
      });
      const updated: ProjectRecord = {
        ...current,
        name: changes.name ?? current.name,
        description: changes.description ?? current.description,
        kind: (changes.kind ?? current.kind) as ProjectKind,
        color: changes.color ?? current.color,
        icon: changes.icon ?? current.icon,
        systemPrompt: changes.systemPrompt ?? current.systemPrompt,
        settings,
        updatedAt: new Date().toISOString(),
      };
      set((state) => ({
        projects: state.projects.map((project) => (project.id === id ? updated : project)),
      }));
      return updated;
    }

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
    const existing = get().projects.find((project) => project.id === id);
    if (isLockEnabled(existing)) {
      throw new Error(
        "This project is password-locked. Delete it with its password, which destroys the encrypted vault.",
      );
    }
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

  enableLock: async (id, options) => {
    const project = get().projects.find((item) => item.id === id);
    if (!project) throw new Error("Project not found.");
    if (isLockEnabled(project)) throw new Error("This project is already password-locked.");

    // Everything the project owns today must move into the vault in one step.
    const sessions = useVaultSessionStore.getState();
    if (sessions.isUnlocked(id)) {
      throw new Error("Lock this project before changing its lock settings.");
    }

    const protectedConversations = useChatStore
      .getState()
      .conversations.filter((conversation) => conversation.projectId === id);
    const protectedMemories = useMemoryStore
      .getState()
      .records.filter((record) => record.projectId === id);

    const result = await enableProjectLock(id, options.password, {
      name: project.name,
      description: project.description,
      kind: project.kind,
      color: project.color,
      icon: project.icon,
      systemPrompt: project.systemPrompt,
      settingsJson: JSON.stringify(project.settings ?? {}),
      conversationsJson: JSON.stringify(protectedConversations),
      memoriesJson: JSON.stringify(protectedMemories),
    });

    // The backend has redacted the row and owns the content now. Register the
    // project as protected *before* the next shared snapshot can be written.
    // Conversation and memory records are filtered out at snapshot time by
    // `stripLockedConversations`/`stripLockedMemories`, so the visible stores
    // can keep showing the history the user just unlocked the project with.
    markProjectLocked(id, { purgeSharedStores: false });
    sessions.registerUnlocked(id, {
      generation: result.generation,
      unlockedAt: result.unlockedAt,
    });

    set((state) => ({
      projects: state.projects.map((item) =>
        item.id === id ? { ...item, lockState: "locked" } : item,
      ),
    }));

    // Rewrite the shared snapshots without the project's content.
    void saveConversationSnapshot(useChatStore.getState().conversations);
    await flushConversationSave();
  },

  lockNow: async (id) => {
    await lockProjectAndConceal(id, "manual");
  },

  lockAll: async () => {
    await lockAllProjectsAndConceal("manual");
  },

  deleteLockedProject: async (id, password) => {
    await deleteLockedProject(id, password);
    useVaultSessionStore.getState().forget(id);
    forgetLockedProject(id);
    notifyMemoryDeletion({ projectId: id });
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
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
