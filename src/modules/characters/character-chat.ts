import type { ChatMessage, Conversation, CharacterConversationSnapshot } from "@/modules/chat/chat-types";
import type { CharacterRecord } from "./character-types";
import { useChatStore } from "@/stores/chat-store";
import { useCharacterStore } from "./character-store";
import { saveConversationSnapshot } from "@/lib/conversation-storage";

function pickGreeting(character: CharacterRecord): string {
  const greetings = [character.firstMessage, ...(character.alternateGreetings ?? [])]
    .map((g) => (g ?? "").trim())
    .filter(Boolean);
  if (greetings.length === 0) return "";
  const idx = Math.floor(Math.random() * greetings.length);
  return greetings[idx];
}

function makeSnapshot(character: CharacterRecord): CharacterConversationSnapshot {
  return {
    id: character.id,
    name: character.name,
    title: character.title,
    avatarColor: character.avatarColor,
    spec: character.spec,
    version: character.version,
  };
}

export interface StartCharacterChatOptions {
  /** Force a specific greeting (overrides random). */
  greeting?: string;
  /** Bump totalChats on the character record (defaults to true). */
  bumpStats?: boolean;
}

/**
 * Creates a new conversation bound to the given character, pre-seeded with
 * the character's first message (or an alternate greeting). Returns the new
 * conversation id and the assistant message id used as the greeting slot.
 */
export function startCharacterChat(
  character: CharacterRecord,
  options: StartCharacterChatOptions = {},
): { conversationId: string; greetingMessageId: string } {
  const greetingText = options.greeting ?? pickGreeting(character);
  const now = Date.now();

  const greetingMessageId = crypto.randomUUID();
  const greetingMessage: ChatMessage = {
    id: greetingMessageId,
    role: "assistant",
    content: greetingText,
    timestamp: now,
  };

  const conversation: Conversation = {
    id: crypto.randomUUID(),
    title: character.name || "Character chat",
    messages: greetingText ? [greetingMessage] : [],
    createdAt: now,
    updatedAt: now,
    characterId: character.id,
    characterSnapshot: makeSnapshot(character),
    characterGreetingIndex: greetingText ? 0 : undefined,
  };

  useChatStore.setState((state) => {
    const conversations = [conversation, ...state.conversations];
    void saveConversationSnapshot(conversations);
    return {
      conversations,
      activeConversationId: conversation.id,
    };
  });

  if (options.bumpStats !== false) {
    void bumpCharacterStats(character.id);
  }

  return { conversationId: conversation.id, greetingMessageId };
}

export interface RegenerateGreetingOptions {
  /** Candidate greetings; defaults to firstMessage + alternates. */
  candidates?: string[];
  /** Avoid returning the same greeting as the current first assistant message. */
  avoidCurrent?: boolean;
}

/**
 * Replaces the seeded greeting in a character conversation with another
 * candidate. No-op if the conversation has no character binding or no
 * candidate is available.
 */
export function regenerateCharacterGreeting(
  conversationId: string,
  character: CharacterRecord,
  options: RegenerateGreetingOptions = {},
): string | null {
  const state = useChatStore.getState();
  const conversation = state.conversations.find((c) => c.id === conversationId);
  if (!conversation || conversation.characterId !== character.id) return null;

  const candidates = (options.candidates ?? [
    character.firstMessage,
    ...(character.alternateGreetings ?? []),
  ])
    .map((g) => (g ?? "").trim())
    .filter(Boolean);
  if (candidates.length === 0) return null;

  const currentGreeting = conversation.messages[conversation.characterGreetingIndex ?? 0]?.content;
  const pool = options.avoidCurrent
    ? candidates.filter((c) => c !== currentGreeting)
    : candidates;
  if (pool.length === 0) return null;
  const next = pool[Math.floor(Math.random() * pool.length)];

  useChatStore.setState((state) => {
    const conversations = state.conversations.map((c) => {
      if (c.id !== conversationId) return c;
      const idx = c.characterGreetingIndex ?? 0;
      if (idx >= c.messages.length) return c;
      const messages = c.messages.map((m, i) => (i === idx ? { ...m, content: next } : m));
      return { ...c, messages, updatedAt: Date.now() };
    });
    void saveConversationSnapshot(conversations);
    return { conversations };
  });

  return next;
}

/**
 * Bumps the character's usage stats. Computes totals from the chat store and
 * updates the in-memory character record so the detail view shows fresh
 * numbers. Best-effort: failures are swallowed so they don't break the chat
 * flow. A future iteration can persist stats to a dedicated column.
 */
export async function bumpCharacterStats(characterId: string): Promise<void> {
  try {
    const charState = useCharacterStore.getState();
    const character = charState.getCharacterById(characterId);
    if (!character) return;

    const convs = useChatStore.getState().conversations.filter((c) => c.characterId === characterId);
    const totalMessages = convs.reduce(
      (sum, c) => sum + c.messages.filter((m) => m.role === "user" || m.role === "assistant").length,
      0,
    );
    const lastUsedAt = convs
      .map((c) => c.updatedAt)
      .reduce((max, t) => (t > max ? t : max), 0);

    const next = {
      ...character,
      stats: {
        totalChats: convs.length,
        totalMessages,
        lastUsedAt: lastUsedAt > 0 ? new Date(lastUsedAt).toISOString() : character.stats?.lastUsedAt,
      },
    };

    useCharacterStore.setState((state) => ({
      characters: state.characters.map((c) => (c.id === characterId ? next : c)),
    }));
  } catch (error) {
    console.warn("[characters] failed to bump stats", error);
  }
}
