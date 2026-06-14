// ── AI assist types for character authoring ──────────────────────────────────
//
// AI assist is a non-tool, non-conversation flow. The user clicks a "Wand"
// affordance, the model returns a structured draft, and the result is shown
// as a pending change the user must explicitly apply.
//
// All assist actions are *proposals* until the user clicks Apply. Nothing the
// model emits is written to the database automatically.

import type {
  CharacterLorebookEntry,
  CharacterRecord,
} from "./character-types";

export type CharacterAssistAction =
  | "generate"
  | "rewrite"
  | "expand"
  | "condense"
  | "suggest_greetings"
  | "suggest_examples"
  | "suggest_tags"
  | "suggest_lorebook"
  | "suggest_keys"
  | "merge_lorebook"
  | "test_lorebook"
  | "director_turn"
  | "import_preview"
  | "export";

export type CharacterAssistTone =
  | "neutral"
  | "evocative"
  | "comedic"
  | "grimdark"
  | "romantic"
  | "mysterious"
  | "scholarly"
  | "casual"
  | "custom";

export interface CharacterAssistRequest {
  action: CharacterAssistAction;
  /** Active character id (omit for "generate from concept"). */
  characterId?: string;
  /** Free text used by "generate from concept". */
  concept?: string;
  /** Field path inside the character (e.g. "description", "personality"). */
  targetField?: string;
  /** Current value of the field (when relevant). */
  currentValue?: string;
  /** Action-specific options. */
  options?: CharacterAssistOptions;
  /** For director_turn: rolling chat log of the director session. */
  directorHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  /** If true, the request should be aborted (cancellable). */
  signal?: AbortSignal;
}

export interface CharacterAssistOptions {
  tone?: CharacterAssistTone;
  customToneInstruction?: string;
  /** Target length hint in characters. */
  lengthHint?: number;
  /** How many suggestions to return (greetings, examples, tags, etc.). */
  count?: number;
  /** Source paragraph for "generate from paragraph" lorebook. */
  paragraph?: string;
  /** Selected lorebook entry ids (for suggest_keys). */
  selectedEntryIds?: string[];
  /** Director user prompt (for director_turn). */
  directorPrompt?: string;
  /** Send current character record as priming context. */
  sendCurrentContext?: boolean;
  /** A list of example labels to drive tone (e.g. "noir", "isekai"). */
  styleHints?: string[];
}

export type CharacterAssistChunkKind =
  | "status"
  | "text"
  | "field"
  | "lorebook"
  | "metadata"
  | "error"
  | "done";

export interface CharacterAssistChunk {
  kind: CharacterAssistChunkKind;
  /** Free-form status text. */
  message?: string;
  /** JSON path inside the result (e.g. "card.description"). */
  path?: string;
  /** Partial value for the path. */
  value?: unknown;
  /** When `kind === "lorebook"`, the partial entry being streamed. */
  entry?: Partial<CharacterLorebookEntry>;
  /** When `kind === "error"`, an error string. */
  error?: string;
  /** When `kind === "done"`, the final token usage if known. */
  usage?: { tokensIn?: number; tokensOut?: number };
}

export interface CharacterAssistResult {
  /** Final draft card. May be partial (some fields are null/undefined). */
  card: Partial<CharacterRecord> | null;
  /** Lorebook entries proposed. */
  lorebookEntries?: CharacterLorebookEntry[];
  /** Free-form text response (used by director_turn, expand, etc.). */
  text?: string;
  /** Soft warnings to surface in the UI. */
  warnings?: string[];
  /** Token usage (if known). */
  usage?: { tokensIn?: number; tokensOut?: number };
}

export type CharacterPendingChangeStatus = "pending" | "applied" | "discarded";

export interface CharacterPendingChange {
  id: string;
  characterId: string;
  /** JSON path inside the character record. */
  field: string;
  /** The label shown in the UI (e.g. "Description", "First Message"). */
  label: string;
  /** The previous value at the time of suggestion. */
  before: unknown;
  /** The proposed new value. */
  after: unknown;
  /** Source assist action. */
  source: CharacterAssistAction;
  /** Creation timestamp. */
  createdAt: string;
  status: CharacterPendingChangeStatus;
}

export interface CharacterDirectorMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface CharacterDirectorSession {
  id: string;
  characterId: string;
  messages: CharacterDirectorMessage[];
  /** Pending change ids tied to this session. */
  pendingChangeIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CharacterLorebookTestRun {
  id: string;
  characterId: string;
  conversationId?: string;
  matchedEntryIds: string[];
  matchedAt: string;
  /** Snippet from the messages that triggered each match. */
  triggerSnippets: Record<string, string>;
}

export interface CharacterAssistTelemetryEvent {
  id: string;
  ts: string;
  action: CharacterAssistAction;
  characterId?: string;
  /** "completed" | "failed" | "refused" | "cancelled". */
  outcome: "completed" | "failed" | "refused" | "cancelled";
  durationMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  errorKind?: string;
  errorMessage?: string;
}

export interface CharacterAssistLog {
  events: CharacterAssistTelemetryEvent[];
}

export type CharacterExportFormat = "veyra" | "chara_card_v3" | "chara_card_v3_png";

export interface CharacterImportPreview {
  /** Veyra-native draft, ready to be passed to create_character. */
  draft: Partial<CharacterRecord>;
  /** Original CCv3 spec used for export. */
  sourceFormat: "chara_card_v3" | "veyra" | "chara_card_v3_png";
  /** Soft warnings (missing fields, schema migrations, etc.). */
  warnings: string[];
  /** The original Veyra id (if present, used to detect duplicates). */
  sourceId?: string;
}
