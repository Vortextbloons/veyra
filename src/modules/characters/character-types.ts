// ── Character types for Veyra ───────────────────────────────────────────────
// A Character is a custom roleplay persona (description, personality, scenario,
// greetings, lorebook). Local-first: stored in the shared veyra.sqlite file.
//
// Card format is Veyra-native at the storage layer; Character Card V3 (CCv3)
// import/export is layered on top in character-io.ts.

export type CharacterSpec = "veyra" | "chara_card_v3";
export type CharacterSource = "native" | "imported_ccv3" | "duplicate";

export type CharacterScope = "global" | "project";

export type CharacterLorebookMatchType = "any" | "all" | "regex";
export type CharacterLorebookPosition = "before" | "after";

export interface CharacterLorebookEntry {
  id: string;
  characterId: string;
  keys: string[];
  secondaryKeys?: string[];
  content: string;
  constant: boolean;
  selective: boolean;
  insertionOrder: number;
  priority: 1 | 2 | 3 | 4 | 5;
  enabled: boolean;
  matchType: CharacterLorebookMatchType;
  caseSensitive: boolean;
  scope: "character" | "global";
  group?: string;
  comment?: string;
  position: CharacterLorebookPosition;
  probability?: number;
  recurseDepth?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterStats {
  totalChats: number;
  totalMessages: number;
  lastUsedAt?: string;
}

export interface CharacterChatDefaults {
  /** How many trailing messages are scanned for lorebook triggers. */
  scanDepth: number;
  /** Max lorebook entries injected per turn (after priority ordering). */
  maxLorebookEntries: number;
  /** Whether to inject example messages as few-shot. */
  includeExamples: boolean;
  /** Whether document AI tools may be used in character chat. */
  allowDocumentTools: boolean;
}

export const DEFAULT_CHARACTER_CHAT_DEFAULTS: CharacterChatDefaults = {
  scanDepth: 4,
  maxLorebookEntries: 6,
  includeExamples: true,
  allowDocumentTools: false,
};

export interface CharacterRecord {
  id: string;
  name: string;
  title?: string;
  avatarPath?: string;
  avatarColor?: string;
  tagline: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  alternateGreetings: string[];
  systemPrompt: string;
  postHistoryInstructions?: string;
  exampleMessages: { user: string; assistant: string }[];
  creatorNotes: string;
  tags: string[];
  category?: string;
  version: string;
  spec: CharacterSpec;
  creator: string;
  source: CharacterSource;
  isGlobal: boolean;
  projectId?: string;
  creatorMetadata?: Record<string, unknown>;
  stats: CharacterStats;
  /** Lorebook entries. Stored inline on the record for v1. */
  lorebookEntries?: CharacterLorebookEntry[];
  /** Per-character chat runtime defaults. */
  chatDefaults?: CharacterChatDefaults;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCharacterInput {
  id: string;
  name: string;
  title?: string;
  avatarPath?: string;
  avatarColor?: string;
  tagline?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  firstMessage?: string;
  alternateGreetings?: string[];
  systemPrompt?: string;
  postHistoryInstructions?: string;
  exampleMessages?: { user: string; assistant: string }[];
  creatorNotes?: string;
  tags?: string[];
  category?: string;
  version?: string;
  spec?: CharacterSpec;
  creator?: string;
  source?: CharacterSource;
  isGlobal?: boolean;
  projectId?: string;
  lorebookEntries?: CharacterLorebookEntry[];
  chatDefaults?: CharacterChatDefaults;
  creatorMetadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCharacterInput {
  id: string;
  name?: string;
  title?: string;
  avatarPath?: string;
  avatarColor?: string;
  tagline?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  firstMessage?: string;
  alternateGreetings?: string[];
  systemPrompt?: string;
  postHistoryInstructions?: string;
  exampleMessages?: { user: string; assistant: string }[];
  creatorNotes?: string;
  tags?: string[];
  category?: string;
  version?: string;
  spec?: CharacterSpec;
  creator?: string;
  source?: CharacterSource;
  isGlobal?: boolean;
  projectId?: string;
  lorebookEntries?: CharacterLorebookEntry[];
  chatDefaults?: CharacterChatDefaults;
  updatedAt: string;
}

export interface ListCharactersFilter {
  isGlobal?: boolean;
  projectId?: string;
  tag?: string;
  category?: string;
  search?: string;
}

export const CHARACTER_AVATAR_COLORS = [
  "indigo",
  "violet",
  "blue",
  "cyan",
  "teal",
  "emerald",
  "amber",
  "orange",
  "rose",
  "pink",
  "slate",
] as const;

export type CharacterAvatarColor = (typeof CHARACTER_AVATAR_COLORS)[number];
