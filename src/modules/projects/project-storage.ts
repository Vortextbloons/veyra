import { invoke } from "@tauri-apps/api/core";
import { newId, nowIso } from "@/lib/id";
import type {
  ProjectRecord,
  CreateProjectInput,
  UpdateProjectInput,
} from "@/modules/projects/project-types";

export async function listProjects(status?: string): Promise<ProjectRecord[]> {
  return invoke<ProjectRecord[]>("list_projects", { status: status ?? null });
}

export async function getProject(id: string): Promise<ProjectRecord> {
  return invoke<ProjectRecord>("get_project", { id });
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
  return invoke<ProjectRecord>("create_project", { input: JSON.stringify(payload) });
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
  return invoke<ProjectRecord>("update_project", { input: JSON.stringify(payload) });
}

export async function deleteProject(id: string): Promise<void> {
  await invoke<void>("delete_project", { id });
}
