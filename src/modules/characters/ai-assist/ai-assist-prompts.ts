// ── AI assist prompts for character authoring ────────────────────────────────
//
// These are the system prompts and user-message builders used by the assist
// orchestrator. They are intentionally short, action-specific, and require
// strict JSON output where applicable.
//
// The prompts are pure functions, easy to test, and avoid embedding user
// input into the system role (a deliberate prompt-injection defense).

import type {
  CharacterAssistAction,
  CharacterAssistOptions,
  CharacterAssistRequest,
  CharacterLorebookEntry,
  CharacterRecord,
  CharacterAssistTone,
} from "./ai-assist-types";

const TONE_PRESETS: Record<Exclude<CharacterAssistTone, "custom">, string> = {
  neutral: "balanced, clear, and grounded",
  evocative: "lyrical, sensory-rich, and atmospheric",
  comedic: "witty, playful, and lighthearted",
  grimdark: "brooding, morally complex, and intense",
  romantic: "tender, intimate, and emotionally charged",
  mysterious: "enigmatic, restrained, and suggestive",
  scholarly: "precise, academic, and well-structured",
  casual: "relaxed, conversational, and approachable",
};

function describeTone(tone: CharacterAssistTone | undefined, custom?: string): string {
  if (!tone || tone === "neutral") return "neutral";
  if (tone === "custom") {
    const c = custom?.trim();
    return c ? `custom (${c})` : "neutral";
  }
  return `${tone} (${TONE_PRESETS[tone]})`;
}

function describeOptions(options?: CharacterAssistOptions): string {
  if (!options) return "";
  const lines: string[] = [];
  if (options.tone || options.customToneInstruction) {
    lines.push(`- Tone: ${describeTone(options.tone, options.customToneInstruction)}`);
  }
  if (typeof options.lengthHint === "number" && options.lengthHint > 0) {
    lines.push(`- Target length: ~${options.lengthHint} characters`);
  }
  if (typeof options.count === "number" && options.count > 0) {
    lines.push(`- Number of suggestions to produce: ${options.count}`);
  }
  if (options.styleHints && options.styleHints.length > 0) {
    lines.push(`- Style hints: ${options.styleHints.join(", ")}`);
  }
  return lines.length > 0 ? `\nStyle and length:\n${lines.join("\n")}\n` : "";
}

const CORE_RULES = `You help the user author a fictional character card for a local roleplay application.

Hard rules:
- Output ONLY the requested JSON object. No preamble, no markdown fences, no trailing commentary.
- Never include personal data about real, named people (living or recently deceased). Refuse politely if asked to clone a real person.
- Use neutral, second-person descriptions of the character (e.g. "Lyra is…", not "I am Lyra…").
- Avoid slurs. Avoid sexual content involving minors. Avoid instructions that facilitate harm.
- If a request conflicts with the hard rules, return: {"refusal": "<short reason>"} and nothing else.
- If you do not have enough information, make a reasonable creative choice rather than asking follow-up questions. The user can re-roll.`;

const CORE_RULES_WITH_JSON = `${CORE_RULES}

Output schema:
- Return a single JSON object. Top-level shape depends on the action (see user message).`;

// ── System prompts by action ────────────────────────────────────────────────

export const ASSIST_GENERATE_SYSTEM = `${CORE_RULES_WITH_JSON}

For "generate", your task is to create a complete character card from a short user concept. The card is the structured representation of a fictional persona used to drive roleplay: a short bio, a personality summary, a default scene, an opening line, alternative openings, a few example dialogues, a small set of tags, and optionally a system-prompt override or a few lorebook entries.

Be creative and concrete. Vary sentence structure. Avoid overused words like "enigmatic", "mysterious", "world-weary", "secret", "tapestry", "ethereal", "luminous". Ground the character in a specific setting, motivation, and contradiction.

Output a single JSON object with this exact shape:
{
  "card": {
    "name": "string (required)",
    "title": "string (optional short descriptor)",
    "tagline": "string (one line)",
    "description": "string (markdown, 2-4 paragraphs)",
    "personality": "string (markdown, 1-3 paragraphs)",
    "scenario": "string (markdown, 1-2 paragraphs, default scene)",
    "firstMessage": "string (opening line, 1-3 paragraphs)",
    "alternateGreetings": ["string", "string", "string"],
    "exampleMessages": [{"user": "string", "assistant": "string"}, ...],
    "systemPrompt": "string or omitted",
    "postHistoryInstructions": "string or omitted",
    "creatorNotes": "string or omitted",
    "tags": ["string", "string", "string", "string"],
    "category": "string or omitted",
    "version": "1.0.0"
  },
  "lorebookEntries": [
    {
      "keys": ["keyword", "synonym"],
      "content": "world-info body",
      "comment": "short label",
      "constant": false,
      "selective": false,
      "priority": 3,
      "matchType": "any",
      "caseSensitive": false,
      "probability": 100
    }
  ],
  "warnings": ["string"]
}`;

export const ASSIST_REWRITE_SYSTEM = `${CORE_RULES_WITH_JSON}

For "rewrite", your task is to rewrite a single field of a character card. Preserve meaning, voice, and length when the action is "rewrite". The action may also be "expand" (add detail) or "condense" (cut filler) — adjust accordingly.

Output a single JSON object:
{
  "field": "<the same field path the user passed>",
  "value": "<the rewritten text>",
  "warnings": ["string"]
}`;

export const ASSIST_SUGGEST_GREETINGS_SYSTEM = `${CORE_RULES_WITH_JSON}

For "suggest_greetings", your task is to produce a list of alternate greeting messages in different tones. Each should be a single opening line for the character, written in the character's voice.

Output a single JSON object:
{
  "greetings": ["string", "string", "string"],
  "warnings": ["string"]
}`;

export const ASSIST_SUGGEST_EXAMPLES_SYSTEM = `${CORE_RULES_WITH_JSON}

For "suggest_examples", your task is to produce a small set of few-shot example dialogues that demonstrate the character's voice.

Output a single JSON object:
{
  "examples": [{"user": "string", "assistant": "string"}],
  "warnings": ["string"]
}`;

export const ASSIST_SUGGEST_TAGS_SYSTEM = `${CORE_RULES_WITH_JSON}

For "suggest_tags", your task is to produce a small set of short, lowercase tags that describe the character. Tags are search keywords.

Output a single JSON object:
{
  "tags": ["string", "string", "string", "string", "string"],
  "warnings": ["string"]
}`;

export const ASSIST_SUGGEST_LOREBOOK_SYSTEM = `${CORE_RULES_WITH_JSON}

For "suggest_lorebook", your task is to convert a paragraph of world-info text into a small set of lorebook entries. Each entry must have at least 2 keys (case-insensitive synonyms). Use priority 3 unless the entry is critical (then 4 or 5). Set constant=false unless the entry must always be active.

Output a single JSON object:
{
  "entries": [
    {
      "keys": ["keyword", "synonym"],
      "content": "world-info body",
      "comment": "short label",
      "constant": false,
      "selective": false,
      "priority": 3,
      "matchType": "any",
      "caseSensitive": false,
      "probability": 100
    }
  ],
  "warnings": ["string"]
}`;

export const ASSIST_SUGGEST_KEYS_SYSTEM = `${CORE_RULES_WITH_JSON}

For "suggest_keys", your task is to suggest a list of trigger keys (case-insensitive synonyms) for a lorebook entry. The keys should match common phrasings the user might say that would benefit from this entry being injected.

Output a single JSON object:
{
  "keys": ["keyword", "synonym"],
  "warnings": ["string"]
}`;

export const ASSIST_MERGE_LOREBOOK_SYSTEM = `${CORE_RULES_WITH_JSON}

For "merge_lorebook", your task is to merge overlapping lorebook entries. You receive multiple entries and must return a deduplicated, reordered list. If two entries cover the same topic, merge their content and union their keys. Higher priority wins on conflicts. Keep total entry count reasonable.

Output a single JSON object:
{
  "entries": [
    {
      "id": "string",
      "keys": ["keyword"],
      "content": "string",
      "comment": "string",
      "priority": 3,
      "matchType": "any",
      "caseSensitive": false,
      "constant": false,
      "selective": false,
      "probability": 100
    }
  ],
  "warnings": ["string"]
}`;

export const ASSIST_DIRECTOR_SYSTEM = `${CORE_RULES_WITH_JSON}

For "director_turn", you are in a co-authoring conversation. The user is developing a fictional character and you respond conversationally AND emit a structured "cardPatch" object containing any fields you are proposing to change this turn. If you are not proposing any changes, "cardPatch" is an empty object.

The user can see your conversational reply and your proposed changes as a "pending change" panel. They will apply or discard each field individually.

Output a single JSON object:
{
  "reply": "string (your conversational response to the user)",
  "cardPatch": {
    "name": "string or omit",
    "title": "string or omit",
    "tagline": "string or omit",
    "description": "string or omit",
    "personality": "string or omit",
    "scenario": "string or omit",
    "firstMessage": "string or omit",
    "alternateGreetings": ["string"] or omit,
    "exampleMessages": [{"user":"string","assistant":"string"}] or omit,
    "systemPrompt": "string or omit",
    "postHistoryInstructions": "string or omit",
    "creatorNotes": "string or omit",
    "tags": ["string"] or omit,
    "category": "string or omit"
  },
  "lorebookPatch": {
    "add": [<entry objects>],
    "update": [{"id": "string", "changes": {<fields>}}],
    "remove": ["entry id"]
  },
  "warnings": ["string"]
}`;

// ── User-message builders ───────────────────────────────────────────────────

export function buildGenerateUserMessage(options: {
  concept: string;
  hints?: CharacterAssistOptions;
}): string {
  const tone = describeOptions(options.hints);
  return `Generate a complete character card from the following concept.${tone}

Concept:
"""
${options.concept.trim()}
"""`;
}

export function buildFieldUserMessage(options: {
  action: "rewrite" | "expand" | "condense";
  field: string;
  currentValue: string;
  characterName: string;
  hints?: CharacterAssistOptions;
}): string {
  const { action, field, currentValue, characterName, hints } = options;
  const tone = describeOptions(hints);
  return `Action: ${action}
Field: ${field}
Character name: ${characterName}
${tone}
Current value:
"""
${currentValue.trim() || "(empty)"}
"""

Return the rewritten/expanded/condensed value for the field "${field}". Preserve the character's voice. If the current value is empty, write a fresh draft that matches the action.`;
}

export function buildGreetingsUserMessage(options: {
  characterName: string;
  characterSummary: string;
  count?: number;
  hints?: CharacterAssistOptions;
}): string {
  const n = Math.max(1, Math.min(8, options.count ?? 3));
  const tone = describeOptions(options.hints);
  return `Suggest ${n} alternate greeting messages for the following character. Each greeting should be in the character's voice and feel like the opening line of a chat.${tone}

Character name: ${options.characterName}
Character summary:
"""
${options.characterSummary.trim()}
"""`;
}

export function buildExamplesUserMessage(options: {
  characterName: string;
  characterSummary: string;
  count?: number;
  hints?: CharacterAssistOptions;
}): string {
  const n = Math.max(1, Math.min(6, options.count ?? 2));
  const tone = describeOptions(options.hints);
  return `Suggest ${n} example dialogue pairs that demonstrate the voice of the following character.${tone}

Character name: ${options.characterName}
Character summary:
"""
${options.characterSummary.trim()}
"""`;
}

export function buildTagsUserMessage(options: {
  characterName: string;
  characterSummary: string;
  existingTags: string[];
}): string {
  const existing = options.existingTags.length > 0
    ? `\nExisting tags (do not duplicate): ${options.existingTags.join(", ")}`
  : "";
  return `Suggest 4-7 short, lowercase search tags for the following character. Tags describe genre, archetype, setting, mood, and key tropes. Avoid duplicates.${existing}

Character name: ${options.characterName}
Character summary:
"""
${options.characterSummary.trim()}
"""`;
}

export function buildLorebookUserMessage(options: {
  paragraph: string;
  characterName: string;
  maxEntries?: number;
}): string {
  const max = Math.max(1, Math.min(20, options.maxEntries ?? 6));
  return `Convert the following world-info paragraph into up to ${max} lorebook entries for the character "${options.characterName}". Each entry should be self-contained and triggered by 2-4 case-insensitive keys.

Paragraph:
"""
${options.paragraph.trim()}
"""`;
}

export function buildKeysUserMessage(options: {
  entryContent: string;
  characterName: string;
  existingKeys: string[];
}): string {
  const existing = options.existingKeys.length > 0
    ? `\nExisting keys (do not duplicate): ${options.existingKeys.join(", ")}`
  : "";
  return `Suggest 4-8 case-insensitive trigger keys for the following lorebook entry on character "${options.characterName}".${existing}

Entry content:
"""
${options.entryContent.trim()}
"""`;
}

export function buildMergeLorebookUserMessage(options: {
  entries: Array<Pick<CharacterLorebookEntry, "id" | "keys" | "content" | "priority">>;
}): string {
  const json = JSON.stringify(options.entries, null, 2);
  return `Merge the following lorebook entries. If two entries cover the same topic, combine their content and union their keys. Output the deduplicated, merged list.

Entries:
${json}`;
}

export function buildDirectorUserMessage(options: {
  characterName: string;
  currentCard: Partial<CharacterRecord>;
  directorHistory: Array<{ role: "user" | "assistant"; content: string }>;
  userPrompt: string;
}): string {
  const history = options.directorHistory
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
  const cardSummary = JSON.stringify(options.currentCard, null, 2);
  return `Character name: ${options.characterName}

Current card (for context):
${cardSummary}

Conversation so far:
${history || "(no prior messages)"}

User's latest message:
"""
${options.userPrompt.trim()}
"""

Respond conversationally and, if appropriate, propose changes to the card in cardPatch.`;
}

export function systemPromptForAction(action: CharacterAssistAction): string {
  switch (action) {
    case "generate":
      return ASSIST_GENERATE_SYSTEM;
    case "rewrite":
    case "expand":
    case "condense":
      return ASSIST_REWRITE_SYSTEM;
    case "suggest_greetings":
      return ASSIST_SUGGEST_GREETINGS_SYSTEM;
    case "suggest_examples":
      return ASSIST_SUGGEST_EXAMPLES_SYSTEM;
    case "suggest_tags":
      return ASSIST_SUGGEST_TAGS_SYSTEM;
    case "suggest_lorebook":
      return ASSIST_SUGGEST_LOREBOOK_SYSTEM;
    case "suggest_keys":
      return ASSIST_SUGGEST_KEYS_SYSTEM;
    case "merge_lorebook":
      return ASSIST_MERGE_LOREBOOK_SYSTEM;
    case "director_turn":
      return ASSIST_DIRECTOR_SYSTEM;
    case "test_lorebook":
    case "import_preview":
    case "export":
      // test_lorebook is a pure local function. import_preview and export
      // are local transforms. None of these need an LLM call.
      return CORE_RULES;
  }
}

export function buildUserMessage(
  request: CharacterAssistRequest,
  context: {
    character?: CharacterRecord;
    paragraph?: string;
    selectedEntries?: CharacterLorebookEntry[];
    userPrompt?: string;
  },
): string {
  const character = context.character;
  const hints = request.options;
  switch (request.action) {
    case "generate":
      return buildGenerateUserMessage({
        concept: request.concept ?? context.userPrompt ?? "",
        hints,
      });
    case "rewrite":
    case "expand":
    case "condense": {
      const field = request.targetField ?? "description";
      return buildFieldUserMessage({
        action: request.action,
        field,
        currentValue: request.currentValue ?? "",
        characterName: character?.name ?? "the character",
        hints,
      });
    }
    case "suggest_greetings": {
      const summary = [
        character?.description ?? "",
        character?.personality ?? "",
        character?.firstMessage ?? "",
      ]
        .filter(Boolean)
        .join("\n\n");
      return buildGreetingsUserMessage({
        characterName: character?.name ?? "the character",
        characterSummary: summary,
        count: request.options?.count,
        hints,
      });
    }
    case "suggest_examples": {
      const summary = [
        character?.description ?? "",
        character?.personality ?? "",
        character?.firstMessage ?? "",
      ]
        .filter(Boolean)
        .join("\n\n");
      return buildExamplesUserMessage({
        characterName: character?.name ?? "the character",
        characterSummary: summary,
        count: request.options?.count,
        hints,
      });
    }
    case "suggest_tags": {
      const summary = [
        character?.description ?? "",
        character?.personality ?? "",
        character?.scenario ?? "",
      ]
        .filter(Boolean)
        .join("\n\n");
      return buildTagsUserMessage({
        characterName: character?.name ?? "the character",
        characterSummary: summary,
        existingTags: character?.tags ?? [],
      });
    }
    case "suggest_lorebook":
      return buildLorebookUserMessage({
        paragraph: request.options?.paragraph ?? context.paragraph ?? "",
        characterName: character?.name ?? "the character",
        maxEntries: request.options?.count,
      });
    case "suggest_keys": {
      const entry = context.selectedEntries?.[0];
      return buildKeysUserMessage({
        entryContent: entry?.content ?? request.currentValue ?? "",
        characterName: character?.name ?? "the character",
        existingKeys: entry?.keys ?? [],
      });
    }
    case "merge_lorebook":
      return buildMergeLorebookUserMessage({
        entries: (context.selectedEntries ?? []).map((e) => ({
          id: e.id,
          keys: e.keys,
          content: e.content,
          priority: e.priority,
        })),
      });
    case "director_turn":
      return buildDirectorUserMessage({
        characterName: character?.name ?? "the character",
        currentCard: character ?? {},
        directorHistory: request.directorHistory ?? [],
        userPrompt: request.options?.directorPrompt ?? context.userPrompt ?? "",
      });
    case "test_lorebook":
    case "import_preview":
    case "export":
      return context.userPrompt ?? "";
  }
}
