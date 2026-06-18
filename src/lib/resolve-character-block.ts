import type { ChatMessage } from "@/modules/chat/chat-types";
import { useCharacterStore } from "@/modules/characters/character-store";
import { evaluateLorebook } from "@/modules/characters/lorebook";
import { buildCharacterContextBlock } from "@/modules/characters/character-context";
import { DEFAULT_CHARACTER_CHAT_DEFAULTS } from "@/modules/characters/character-types";
import type { CharacterRecord } from "@/modules/characters/character-types";
import { useCharacterGroupStore } from "@/modules/characters/character-group-store";
import { buildGroupContextBlock } from "@/modules/characters/group-context";

/**
 * Resolves the character context block for a conversation, if any. Looks up
 * the character by id, evaluates its lorebook against the trailing scan
 * window, and returns the rendered system block. Returns null for plain
 * (non-character) conversations.
 */
export function resolveCharacterBlock(
  conversation: { characterId?: string | null; groupId?: string | null } | null | undefined,
  messages: ChatMessage[],
): string | null {
  if (!conversation) return null;
  if (conversation.groupId) {
    const group = useCharacterGroupStore
      .getState()
      .groups.find((g) => g.id === conversation.groupId);
    if (!group) return null;
    const allCharacters = useCharacterStore.getState().characters;
    const members = group.memberIds
      .map((id) => allCharacters.find((c) => c.id === id))
      .filter((c): c is CharacterRecord => Boolean(c));
    if (members.length === 0) return null;
    const activeSpeakerId = conversation.characterId ?? members[0].id;
    const chatDefaults = {
      ...DEFAULT_CHARACTER_CHAT_DEFAULTS,
      ...(members[0]?.chatDefaults ?? {}),
    };
    return buildGroupContextBlock(
      { ...group, activeSpeakerId },
      members,
      messages,
      { chatDefaults },
    );
  }
  if (!conversation.characterId) return null;
  const character: CharacterRecord | undefined = useCharacterStore
    .getState()
    .characters.find((c) => c.id === conversation.characterId);
  if (!character) return null;
  const chatDefaults = {
    ...DEFAULT_CHARACTER_CHAT_DEFAULTS,
    ...(character.chatDefaults ?? {}),
  };
  const lorebookResult = evaluateLorebook(character.lorebookEntries, messages, {
    scanDepth: chatDefaults.scanDepth,
    maxEntries: chatDefaults.maxLorebookEntries,
  });
  return buildCharacterContextBlock(character, {
    chatDefaults,
    matchedLorebook: lorebookResult.matches,
  });
}
