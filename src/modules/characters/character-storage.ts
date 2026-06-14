import { invoke } from "@tauri-apps/api/core";
import { newId, nowIso } from "@/lib/id";
import type {
  CharacterRecord,
  CreateCharacterInput,
  UpdateCharacterInput,
  ListCharactersFilter,
} from "./character-types";

function serializeFilter(filter?: ListCharactersFilter): string {
  return filter ? JSON.stringify(filter) : "";
}

export async function listCharacters(
  filter?: ListCharactersFilter,
): Promise<CharacterRecord[]> {
  return invoke<CharacterRecord[]>("list_characters", {
    filter: serializeFilter(filter),
  });
}

export async function getCharacter(id: string): Promise<CharacterRecord> {
  return invoke<CharacterRecord>("get_character", { id });
}

export async function createCharacter(
  input: Omit<CreateCharacterInput, "id"> & { id?: string },
): Promise<CharacterRecord> {
  const now = nowIso();
  const id = input.id && input.id.length > 0 ? input.id : newId("char");
  const payload: Record<string, unknown> = {
    id,
    name: input.name,
    title: input.title ?? "",
    avatarPath: input.avatarPath ?? "",
    avatarColor: input.avatarColor ?? "indigo",
    tagline: input.tagline ?? "",
    description: input.description ?? "",
    personality: input.personality ?? "",
    scenario: input.scenario ?? "",
    firstMessage: input.firstMessage ?? "",
    alternateGreetings: JSON.stringify(input.alternateGreetings ?? []),
    systemPrompt: input.systemPrompt ?? "",
    postHistoryInstructions: input.postHistoryInstructions ?? "",
    exampleMessages: JSON.stringify(input.exampleMessages ?? []),
    creatorNotes: input.creatorNotes ?? "",
    tags: JSON.stringify(input.tags ?? []),
    category: input.category ?? "",
    version: input.version ?? "1.0.0",
    spec: input.spec ?? "veyra",
    creator: input.creator ?? "",
    source: input.source ?? "native",
    isGlobal: input.isGlobal ?? true,
    projectId: input.projectId ?? "",
    lorebookEntries: JSON.stringify(input.lorebookEntries ?? []),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
  if (input.chatDefaults) {
    payload.chatDefaults = JSON.stringify(input.chatDefaults);
  }
  return invoke<CharacterRecord>("create_character", {
    input: JSON.stringify(payload),
  });
}

export async function updateCharacter(
  input: UpdateCharacterInput,
): Promise<CharacterRecord> {
  const payload: Record<string, unknown> = {
    id: input.id,
    updatedAt: input.updatedAt,
  };
  if (input.name !== undefined) payload.name = input.name;
  if (input.title !== undefined) payload.title = input.title;
  if (input.avatarPath !== undefined) payload.avatarPath = input.avatarPath;
  if (input.avatarColor !== undefined) payload.avatarColor = input.avatarColor;
  if (input.tagline !== undefined) payload.tagline = input.tagline;
  if (input.description !== undefined) payload.description = input.description;
  if (input.personality !== undefined) payload.personality = input.personality;
  if (input.scenario !== undefined) payload.scenario = input.scenario;
  if (input.firstMessage !== undefined) payload.firstMessage = input.firstMessage;
  if (input.alternateGreetings !== undefined) {
    payload.alternateGreetings = JSON.stringify(input.alternateGreetings);
  }
  if (input.systemPrompt !== undefined) payload.systemPrompt = input.systemPrompt;
  if (input.postHistoryInstructions !== undefined) {
    payload.postHistoryInstructions = input.postHistoryInstructions;
  }
  if (input.exampleMessages !== undefined) {
    payload.exampleMessages = JSON.stringify(input.exampleMessages);
  }
  if (input.creatorNotes !== undefined) payload.creatorNotes = input.creatorNotes;
  if (input.tags !== undefined) payload.tags = JSON.stringify(input.tags);
  if (input.category !== undefined) payload.category = input.category;
  if (input.version !== undefined) payload.version = input.version;
  if (input.spec !== undefined) payload.spec = input.spec;
  if (input.creator !== undefined) payload.creator = input.creator;
  if (input.source !== undefined) payload.source = input.source;
  if (input.isGlobal !== undefined) payload.isGlobal = input.isGlobal;
  if (input.projectId !== undefined) payload.projectId = input.projectId;
  if (input.lorebookEntries !== undefined) {
    payload.lorebookEntries = JSON.stringify(input.lorebookEntries);
  }
  if (input.chatDefaults !== undefined) {
    if (input.chatDefaults) {
      payload.chatDefaults = JSON.stringify(input.chatDefaults);
    } else {
      payload.chatDefaults = null;
    }
  }
  return invoke<CharacterRecord>("update_character", {
    input: JSON.stringify(payload),
  });
}

export async function deleteCharacter(id: string): Promise<void> {
  await invoke<void>("delete_character", { id });
}
