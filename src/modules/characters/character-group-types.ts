// ── Character group types ───────────────────────────────────────────────────
//
// A group is a named roster of characters that share a conversation. The
// roster drives multi-character chat: a single conversation binds to a
// group instead of a single character, and the chat pipeline injects the
// roster, an active speaker, and the merged lorebook into the system block.

export type CharacterGroupSpeakerMode = "manual" | "auto";

export interface CharacterGroupRecord {
  id: string;
  name: string;
  description: string;
  scenario: string;
  /** Character ids in user-defined display order. */
  memberIds: string[];
  /**
   * "manual" — the user picks the active speaker each turn.
   * "auto"   — the model picks the active speaker based on the conversation.
   */
  speakerMode: CharacterGroupSpeakerMode;
  /** Conversation ids bound to this group, for the "Recent chats" panel. */
  recentConversationIds: string[];
  /** Optional first-line opening the group shares when starting a chat. */
  openingMessage: string;
  /** Last-picked active speaker; set by the orchestrator or the user. */
  activeSpeakerId?: string;
  isGlobal: boolean;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCharacterGroupInput {
  id: string;
  name: string;
  description?: string;
  scenario?: string;
  memberIds?: string[];
  speakerMode?: CharacterGroupSpeakerMode;
  openingMessage?: string;
  isGlobal?: boolean;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCharacterGroupInput {
  id: string;
  name?: string;
  description?: string;
  scenario?: string;
  memberIds?: string[];
  speakerMode?: CharacterGroupSpeakerMode;
  openingMessage?: string;
  isGlobal?: boolean;
  projectId?: string;
  /** Updated server-side; clients should pass this through. */
  recentConversationIds?: string[];
  /** Updated server-side; clients should pass this through. */
  activeSpeakerId?: string;
  updatedAt: string;
}

export interface ListCharacterGroupsFilter {
  isGlobal?: boolean;
  projectId?: string;
  memberId?: string;
  search?: string;
}
