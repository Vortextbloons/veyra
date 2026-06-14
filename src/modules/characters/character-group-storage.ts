// ── Character group storage (Tauri invoke wrappers) ────────────────────────
//
// Mirrors the Rust commands in `character_group_commands.rs`. The shape of
// payload is the same as the Rust input struct; we serialize JSON-shaped
// fields (memberIds, etc.) to strings the way the rest of the feature does.

import { invoke } from "@tauri-apps/api/core";
import { newId, nowIso } from "@/lib/id";
import type {
  CharacterGroupRecord,
  CharacterGroupSpeakerMode,
  CreateCharacterGroupInput,
  ListCharacterGroupsFilter,
  UpdateCharacterGroupInput,
} from "./character-group-types";

function serializeFilter(filter?: ListCharacterGroupsFilter): string {
  return filter ? JSON.stringify(filter) : "";
}

export async function listCharacterGroups(
  filter?: ListCharacterGroupsFilter,
): Promise<CharacterGroupRecord[]> {
  return invoke<CharacterGroupRecord[]>("list_character_groups", {
    filter: serializeFilter(filter),
  });
}

export async function getCharacterGroup(id: string): Promise<CharacterGroupRecord> {
  return invoke<CharacterGroupRecord>("get_character_group", { id });
}

export async function createCharacterGroup(
  input: Omit<CreateCharacterGroupInput, "id"> & { id?: string },
): Promise<CharacterGroupRecord> {
  const now = nowIso();
  const id = input.id && input.id.length > 0 ? input.id : newId("group");
  const payload: Record<string, unknown> = {
    id,
    name: input.name,
    description: input.description ?? "",
    scenario: input.scenario ?? "",
    memberIds: JSON.stringify(input.memberIds ?? []),
    speakerMode: input.speakerMode ?? ("auto" as CharacterGroupSpeakerMode),
    openingMessage: input.openingMessage ?? "",
    isGlobal: input.isGlobal ?? true,
    projectId: input.projectId ?? "",
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
  return invoke<CharacterGroupRecord>("create_character_group", {
    input: JSON.stringify(payload),
  });
}

export async function updateCharacterGroup(
  input: UpdateCharacterGroupInput,
): Promise<CharacterGroupRecord> {
  const payload: Record<string, unknown> = {
    id: input.id,
    updatedAt: input.updatedAt,
  };
  if (input.name !== undefined) payload.name = input.name;
  if (input.description !== undefined) payload.description = input.description;
  if (input.scenario !== undefined) payload.scenario = input.scenario;
  if (input.memberIds !== undefined) {
    payload.memberIds = JSON.stringify(input.memberIds);
  }
  if (input.speakerMode !== undefined) payload.speakerMode = input.speakerMode;
  if (input.openingMessage !== undefined) payload.openingMessage = input.openingMessage;
  if (input.isGlobal !== undefined) payload.isGlobal = input.isGlobal;
  if (input.projectId !== undefined) payload.projectId = input.projectId;
  if (input.recentConversationIds !== undefined) {
    payload.recentConversationIds = JSON.stringify(input.recentConversationIds);
  }
  if (input.activeSpeakerId !== undefined) {
    payload.activeSpeakerId = input.activeSpeakerId;
  }
  return invoke<CharacterGroupRecord>("update_character_group", {
    input: JSON.stringify(payload),
  });
}

export async function deleteCharacterGroup(id: string): Promise<void> {
  await invoke<void>("delete_character_group", { id });
}
