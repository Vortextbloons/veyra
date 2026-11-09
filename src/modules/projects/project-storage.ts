import { invoke } from "@tauri-apps/api/core";
import { newId, nowIso } from "@/lib/id";
import type {
  ProjectRecord,
  CreateProjectInput,
  UpdateProjectInput,
} from "@/modules/projects/project-types";

type ProjectRow = Omit<ProjectRecord, "settings"> & {
  settingsJson: string;
  lockState?: string;
};

function fromRow(row: ProjectRow): ProjectRecord {
  let settings: ProjectRecord["settings"] = {};
  try { settings = JSON.parse(row.settingsJson) as ProjectRecord["settings"]; } catch { /* Preserve access to projects with invalid settings. */ }
  // A locked row's content columns are redacted server-side. `name` is left
  // empty on purpose so nothing downstream can present a stale title as real.
  return {
    ...row,
    settings: settings ?? {},
    lockState: row.lockState === "locked" ? "locked" : "none",
  };
}

export async function listProjects(status?: string): Promise<ProjectRecord[]> {
  return (await invoke<ProjectRow[]>("list_projects", { status: status ?? null })).map(fromRow);
}

export async function createProject(
  input: Omit<CreateProjectInput, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<ProjectRecord> {
  const now = nowIso();
  const id = input.id && input.id.length > 0 ? input.id : newId("proj");
  const payload = {
    id,
    name: input.name,
    description: input.description ?? "",
    kind: input.kind ?? "general",
    status: input.status ?? "active",
    color: input.color ?? "indigo",
    icon: input.icon ?? "folder",
    systemPrompt: input.systemPrompt ?? "",
    settingsJson: JSON.stringify(input.settings ?? {}),
    createdAt: now,
    updatedAt: now,
  };
  return fromRow(await invoke<ProjectRow>("create_project", { input: JSON.stringify(payload) }));
}

export async function updateProject(input: UpdateProjectInput): Promise<ProjectRecord> {
  const payload: Record<string, unknown> = {
    id: input.id,
    updatedAt: input.updatedAt,
  };
  if (input.name !== undefined) payload.name = input.name;
  if (input.description !== undefined) payload.description = input.description;
  if (input.kind !== undefined) payload.kind = input.kind;
  if (input.status !== undefined) payload.status = input.status;
  if (input.color !== undefined) payload.color = input.color;
  if (input.icon !== undefined) payload.icon = input.icon;
  if (input.systemPrompt !== undefined) payload.systemPrompt = input.systemPrompt;
  if (input.settings !== undefined) payload.settingsJson = JSON.stringify(input.settings);
  if (input.lastOpenedAt !== undefined) payload.lastOpenedAt = input.lastOpenedAt;
  return fromRow(await invoke<ProjectRow>("update_project", { input: JSON.stringify(payload) }));
}

export async function deleteProject(id: string): Promise<void> {
  await invoke<void>("delete_project", { id });
}

// ── Locked project content ──────────────────────────────────────────────────
//
// A lock-enabled project's details live inside its vault. These helpers keep all
// vault-aware reads/writes in one place so no screen has to remember the rule.

export type LockedProjectContent = {
  name: string;
  description: string;
  kind: string;
  color: string;
  icon: string;
  systemPrompt: string;
  settings: ProjectRecord["settings"];
};

export function toLockedContent(project: ProjectRecord): LockedProjectContent {
  return {
    name: project.name,
    description: project.description,
    kind: project.kind,
    color: project.color,
    icon: project.icon,
    systemPrompt: project.systemPrompt,
    settings: project.settings,
  };
}

/** Reads a locked project's real content. Throws when the project is not unlocked. */
export async function readLockedProjectContent(
  projectId: string,
  generation: number | null,
): Promise<LockedProjectContent | null> {
  const { readVaultJson } = await import("@/lib/project-vault");
  return readVaultJson<LockedProjectContent>(projectId, generation, "project", projectId);
}

/** Writes a locked project's content back into its vault. */
export async function writeLockedProjectContent(
  projectId: string,
  generation: number | null,
  content: LockedProjectContent,
): Promise<void> {
  const { writeVaultRecord } = await import("@/lib/project-vault");
  await writeVaultRecord(projectId, generation, "project", projectId, content);
}
