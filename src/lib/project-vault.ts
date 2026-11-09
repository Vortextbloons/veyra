import { invoke } from "@tauri-apps/api/core";

/**
 * Frontend client for locked-project vaults.
 *
 * These calls are the only way protected project data moves between the Rust
 * vault and the UI. Every record read/write carries the session `generation`
 * returned by `unlock`, so a request that was queued before a lock is rejected
 * by the backend instead of resolving with stale content.
 *
 * This module deliberately keeps no copy of the password and no key material.
 * The password goes straight to Rust and is not retained here.
 */

export type VaultPhase = "locked" | "unlocking" | "unlocked" | "locking";

export type VaultStatus = {
  projectId: string;
  phase: VaultPhase;
  hasVault: boolean;
  migrationState?: string | null;
  generation?: number | null;
  unlockedAt?: string | null;
};

export type VaultRecordKind =
  | "project"
  | "conversation"
  | "memory"
  | "draft"
  | "artifact"
  | "attachment-meta"
  | "settings"
  | "index";

export type VaultRecord = {
  kind: string;
  id: string;
  revision: number;
  dataJson: string;
  recoveredFromBackup?: boolean;
};

export type EnableLockResult = {
  generation: number;
  unlockedAt: string;
  migratedConversations: number;
  migratedMemories: number;
};

export type ProjectContentPayload = {
  name: string;
  description: string;
  kind: string;
  color: string;
  icon: string;
  systemPrompt: string;
  settingsJson: string;
  conversationsJson: string;
  memoriesJson: string;
};

export type EncryptedExportResult = {
  path: string;
  bytes: number;
};

export function isVaultUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /unlocked session|has ended|password-locked|failed authentication/i.test(message);
}

export async function getVaultStatus(projectId: string): Promise<VaultStatus> {
  return invoke<VaultStatus>("get_project_vault_status", { projectId });
}

export async function listUnlockedVaults(): Promise<string[]> {
  return invoke<string[]>("list_unlocked_project_vaults");
}

export async function enableProjectLock(
  projectId: string,
  password: string,
  payload: ProjectContentPayload,
): Promise<EnableLockResult> {
  return invoke<EnableLockResult>("enable_project_lock", { projectId, password, payload });
}

export async function unlockProject(
  projectId: string,
  password: string,
): Promise<{ projectId: string; generation: number; unlockedAt: string }> {
  return invoke("unlock_project", { projectId, password });
}

export async function lockProject(projectId: string): Promise<void> {
  await invoke("lock_project", { projectId });
}

export async function lockAllProjects(): Promise<string[]> {
  return invoke<string[]>("lock_all_projects");
}

export async function readVaultRecord(
  projectId: string,
  generation: number | null,
  kind: VaultRecordKind,
  id: string,
): Promise<VaultRecord> {
  return invoke<VaultRecord>("read_vault_record", { projectId, generation, kind, id });
}

export async function writeVaultRecord(
  projectId: string,
  generation: number | null,
  kind: VaultRecordKind,
  id: string,
  data: unknown,
): Promise<number> {
  return invoke<number>("write_vault_record", {
    projectId,
    generation,
    kind,
    id,
    dataJson: JSON.stringify(data),
  });
}

export async function deleteVaultRecord(
  projectId: string,
  generation: number | null,
  kind: VaultRecordKind,
  id: string,
): Promise<void> {
  await invoke("delete_vault_record", { projectId, generation, kind, id });
}

export async function listVaultRecords(
  projectId: string,
  generation: number | null,
  kind: VaultRecordKind,
): Promise<Array<{ id: string; revision: number }>> {
  return invoke("list_vault_records", { projectId, generation, kind });
}

export async function changeProjectPassword(
  projectId: string,
  currentPassword: string,
  newPassword: string,
): Promise<number> {
  return invoke<number>("change_project_password", {
    projectId,
    currentPassword,
    newPassword,
  });
}

export async function deleteLockedProject(
  projectId: string,
  password: string,
): Promise<void> {
  await invoke("delete_locked_project", { projectId, password });
}

export async function exportLockedProject(
  projectId: string,
  generation: number | null,
  targetPath: string,
  options?: { plaintext?: boolean },
): Promise<EncryptedExportResult> {
  return invoke<EncryptedExportResult>("export_locked_project", {
    projectId,
    generation,
    targetPath,
    plaintext: options?.plaintext ?? false,
  });
}

/** Reads and JSON-parses one record; returns null when it does not exist. */
export async function readVaultJson<T>(
  projectId: string,
  generation: number | null,
  kind: VaultRecordKind,
  id: string,
): Promise<T | null> {
  try {
    const record = await readVaultRecord(projectId, generation, kind, id);
    return JSON.parse(record.dataJson) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/missing/i.test(message)) return null;
    throw error;
  }
}
