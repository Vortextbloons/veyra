// ── Group chat helpers ───────────────────────────────────────────────────────
//
// Mirrors `character-chat.ts` for groups: start a group conversation with a
// chosen opening line, regenerate the greeting, and switch the active
// speaker.

import { newId, nowIso } from "@/lib/id";
import { useChatStore } from "@/stores/chat-store";
import { useCharacterStore } from "./character-store";
import { useCharacterGroupStore } from "./character-group-store";
import type { CharacterGroupRecord } from "./character-group-types";
import type { CharacterRecord } from "./character-types";

export interface StartGroupChatOptions {
  speakerId?: string;
}

/**
 * Create a new conversation bound to a group and seed it with an opening
 * message from the chosen (or first) member.
 */
export function startGroupChat(
  group: CharacterGroupRecord,
  options: StartGroupChatOptions = {},
): string {
  const characters = useCharacterStore.getState().characters;
  const members = group.memberIds
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is CharacterRecord => Boolean(c));
  if (members.length === 0) return "";

  const speaker =
    members.find((m) => m.id === options.speakerId) ??
    members.find((m) => m.id === group.activeSpeakerId) ??
    members[0];

  const opening = pickGroupOpening(group, speaker);

  const now = Date.now();
  const conversationId = newId("conv");
  const assistantMessageId = newId("msg");

  const conversation = {
    id: conversationId,
    title: group.name || "Group chat",
    messages: [
      {
        id: assistantMessageId,
        role: "assistant" as const,
        content: opening,
        timestamp: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    experience: "standard" as const,
    groupId: group.id,
    // Reuse `characterId` to carry the active speaker.
    characterId: speaker.id,
    // Stash the snapshot inside the existing characterSnapshot field.
    characterSnapshot: {
      id: group.id,
      name: group.name,
      title: group.scenario || "Group",
      avatarColor: "indigo",
      spec: "veyra" as const,
      version: "1",
    },
  };

  useChatStore.setState((state) => ({
    conversations: [conversation, ...state.conversations],
    activeConversationId: conversationId,
  }));

  // Best-effort persist — chat-store has its own save path.
  void import("@/lib/conversation-storage").then(({ saveConversationSnapshot }) => {
    void saveConversationSnapshot(useChatStore.getState().conversations);
  });

  // Mark the group as recently used by binding this conversation id to it.
  const updatedRecent = [conversationId, ...group.recentConversationIds.filter((id) => id !== conversationId)].slice(0, 8);
  void useCharacterGroupStore.getState().updateGroup({
    id: group.id,
    memberIds: group.memberIds,
    recentConversationIds: updatedRecent,
    activeSpeakerId: speaker.id,
    updatedAt: nowIso(),
  });

  return conversationId;
}

function pickGroupOpening(group: CharacterGroupRecord, speaker: CharacterRecord): string {
  const groupOpening = (group.openingMessage ?? "").trim();
  if (groupOpening) {
    return prefixWithName(group.name, speaker, groupOpening);
  }
  const speakerGreeting = (speaker.firstMessage ?? "").trim();
  if (speakerGreeting) {
    return prefixWithName(group.name, speaker, speakerGreeting);
  }
  return `[${group.name}] ${speaker.name} is here.`;
}

function prefixWithName(_groupName: string, speaker: CharacterRecord, body: string): string {
  if (body.startsWith(`${speaker.name}:`) || body.startsWith(`[${speaker.name}]`)) {
    return body;
  }
  return `[${speaker.name}] ${body}`;
}

/**
 * Switch the active speaker for an existing group conversation. The new
 * speaker id is mirrored onto `conversation.characterId` so the orchestrator
 * picks them up next turn.
 */
export function setGroupActiveSpeaker(conversationId: string, speakerId: string): void {
  useChatStore.setState((state) => ({
    conversations: state.conversations.map((c) =>
      c.id === conversationId ? { ...c, characterId: speakerId } : c,
    ),
  }));
  void import("@/lib/conversation-storage").then(({ saveConversationSnapshot }) => {
    void saveConversationSnapshot(useChatStore.getState().conversations);
  });
}

/**
 * Replace the greeting slot (assumed to be the first assistant message) with
 * a different greeting from the same speaker, or with another member's
 * greeting if `speakerId` is provided.
 */
export function regenerateGroupGreeting(
  conversationId: string,
  group: CharacterGroupRecord,
  speakerId?: string,
): void {
  const characters = useCharacterStore.getState().characters;
  const members = group.memberIds
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is CharacterRecord => Boolean(c));
  if (members.length === 0) return;
  const speaker = members.find((m) => m.id === speakerId) ?? members[0];
  const newOpening = pickGroupOpening(group, speaker);

  useChatStore.setState((state) => ({
    conversations: state.conversations.map((c) => {
      if (c.id !== conversationId) return c;
      const messages = [...c.messages];
      if (messages.length > 0) {
        messages[0] = { ...messages[0], content: newOpening };
      }
      return { ...c, messages, characterId: speaker.id, updatedAt: Date.now() };
    }),
  }));
  void import("@/lib/conversation-storage").then(({ saveConversationSnapshot }) => {
    void saveConversationSnapshot(useChatStore.getState().conversations);
  });
}
