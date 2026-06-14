// ── CCv3 ↔ Veyra card mapping ───────────────────────────────────────────────
//
// Implements a small, opinionated subset of the Character Card V3 spec
// (https://github.com/malfoyslastname/character-card-spec-v3) that's enough
// for round-tripping cards via JSON and PNG-with-chunk. The Veyra-native
// record stays the source of truth; CCv3 is the wire format.

import { newId, nowIso } from "@/lib/id";
import type {
  CharacterLorebookEntry,
  CharacterRecord,
} from "../character-types";

export interface Ccv3CardData {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string[];
  tags: string[];
  creator: string;
  character_version: string;
  extensions: Record<string, unknown>;
  /** Spec v3 also supports a `character_book` for the lorebook. */
  character_book?: Ccv3CharacterBook;
}

export interface Ccv3CharacterBook {
  name?: string;
  description?: string;
  scan_depth?: number;
  token_budget?: number;
  recursive_scanning?: boolean;
  entries: Ccv3LorebookEntry[];
}

export interface Ccv3LorebookEntry {
  id?: number | string;
  keys: string[];
  secondary_keys?: string[];
  comment?: string;
  content: string;
  constant?: boolean;
  selective?: boolean;
  insertion_order: number;
  enabled?: boolean;
  position?: "before_char" | "after_char";
  use_regex?: boolean;
  case_sensitive?: boolean;
  priority?: number;
  probability?: number;
  extensions?: Record<string, unknown>;
}

export interface Ccv3Card {
  spec: "chara_card_v3";
  spec_version: "3.0";
  data: Ccv3CardData;
  /** Optional: explicit id for round-tripping. */
  id?: string;
  /** Optional: a creation timestamp. */
  creation_date?: string;
}

export interface Ccv3ParseResult {
  card: Ccv3Card;
  warnings: string[];
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function parseExampleBlock(block: string): { user: string; assistant: string }[] {
  if (!block || !block.trim()) return [];
  // CCv3 example dialogues are a multi-line block. The first line per pair
  // starts with "<START>" and is a marker; the next two lines are user/assistant
  // tagged as "{{user}}:" and "{{char}}:". We accept a few common variants.
  const lines = block.split(/\r?\n/);
  const out: { user: string; assistant: string }[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === "<START>" || line === "") {
      i++;
      continue;
    }
    const userMatch = line.match(/^(\{\{user\}\}|USER|User)\s*:\s*(.*)$/);
    if (userMatch) {
      const user = userMatch[2];
      i++;
      // Find the next assistant line
      while (i < lines.length) {
        const next = lines[i].trim();
        const assistantMatch = next.match(/^(\{\{char\}\}|ASSISTANT|Assistant|Char)\s*:\s*(.*)$/);
        if (assistantMatch) {
          out.push({ user, assistant: assistantMatch[2] });
          i++;
          break;
        }
        i++;
      }
    } else {
      i++;
    }
  }
  return out;
}

function serializeExamples(examples: { user: string; assistant: string }[]): string {
  if (examples.length === 0) return "";
  return examples
    .map((ex) => `<START>\n{{user}}: ${ex.user}\n{{char}}: ${ex.assistant}`)
    .join("\n");
}

function mapLorebookEntries(
  entries: CharacterLorebookEntry[] | undefined,
  _characterId: string,
  warnings: string[],
): Ccv3LorebookEntry[] {
  if (!entries) return [];
  return entries.map((e) => {
    if (e.secondaryKeys && e.secondaryKeys.length > 0) {
      warnings.push(`Entry "${e.comment ?? e.keys.join(",")}" has secondary_keys; not all clients honor them.`);
    }
    return {
      id: e.id,
      keys: e.keys,
      secondary_keys: e.secondaryKeys ?? [],
      comment: e.comment ?? "",
      content: e.content,
      constant: e.constant,
      selective: e.selective,
      insertion_order: e.insertionOrder,
      enabled: e.enabled,
      position: e.position === "after" ? "after_char" : "before_char",
      use_regex: e.matchType === "regex",
      case_sensitive: e.caseSensitive,
      priority: e.priority * 10,
      probability: e.probability ?? 100,
      extensions: {},
    };
  });
}

function unmapLorebookEntries(
  entries: Ccv3LorebookEntry[] | undefined,
  characterId: string,
  warnings: string[],
): CharacterLorebookEntry[] {
  if (!entries || entries.length === 0) return [];
  return entries.map((e) => {
    if (typeof e.priority === "number" && e.priority > 5) {
      warnings.push(`Lorebook entry "${e.comment ?? e.keys.join(",")}" priority=${e.priority} was clamped to 5.`);
    }
    if (e.position === "after_char") {
      warnings.push("Lorebook entry position=after was kept; Veyra renders all entries before the persona for v1.");
    }
    return {
      id: typeof e.id === "string" && e.id.length > 0 ? e.id : newId("lbe"),
      characterId,
      keys: asStringArray(e.keys),
      secondaryKeys: asStringArray(e.secondary_keys),
      content: asString(e.content),
      constant: Boolean(e.constant),
      selective: Boolean(e.selective),
      insertionOrder: typeof e.insertion_order === "number" ? e.insertion_order : 0,
      priority: Math.max(1, Math.min(5, Math.round((e.priority ?? 30) / 10))) as 1 | 2 | 3 | 4 | 5,
      enabled: e.enabled !== false,
      matchType: e.use_regex ? "regex" : "any",
      caseSensitive: Boolean(e.case_sensitive),
      scope: "character",
      group: undefined,
      comment: asString(e.comment) || undefined,
      position: e.position === "after_char" ? "after" : "before",
      probability: typeof e.probability === "number" ? e.probability : undefined,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  });
}

export function veyraToCcv3(character: CharacterRecord): Ccv3Card {
  const warnings: string[] = [];
  return {
    spec: "chara_card_v3",
    spec_version: "3.0",
    id: character.id,
    creation_date: character.createdAt,
    data: {
      name: character.name,
      description: character.description,
      personality: character.personality,
      scenario: character.scenario,
      first_mes: character.firstMessage,
      mes_example: serializeExamples(character.exampleMessages),
      creator_notes: character.creatorNotes,
      system_prompt: character.systemPrompt,
      post_history_instructions: character.postHistoryInstructions ?? "",
      alternate_greetings: character.alternateGreetings,
      tags: character.tags,
      creator: character.creator,
      character_version: character.version,
      extensions: (character.creatorMetadata as Record<string, unknown> | undefined) ?? {},
      character_book:
        character.lorebookEntries && character.lorebookEntries.length > 0
          ? {
              name: `${character.name} Lorebook`,
              description: "",
              scan_depth: character.chatDefaults?.scanDepth ?? 4,
              token_budget: 1500,
              recursive_scanning: false,
              entries: mapLorebookEntries(character.lorebookEntries, character.id, warnings),
            }
          : undefined,
    },
  };
}

export function ccv3ToVeyra(card: Ccv3Card): { record: Partial<CharacterRecord>; warnings: string[] } {
  const warnings: string[] = [];
  const data = card.data;
  const id = card.id ?? newId("char");
  const createdAt = card.creation_date ?? nowIso();
  const updatedAt = nowIso();
  const characterBook = data.character_book;
  const entries = characterBook
    ? unmapLorebookEntries(characterBook.entries, id, warnings)
    : [];

  return {
    warnings,
    record: {
      id,
      name: asString(data.name, "Unnamed"),
      title: "",
      avatarPath: "",
      avatarColor: "indigo",
      tagline: "",
      description: asString(data.description),
      personality: asString(data.personality),
      scenario: asString(data.scenario),
      firstMessage: asString(data.first_mes),
      alternateGreetings: asStringArray(data.alternate_greetings),
      systemPrompt: asString(data.system_prompt),
      postHistoryInstructions: asString(data.post_history_instructions) || undefined,
      exampleMessages: parseExampleBlock(asString(data.mes_example)),
      creatorNotes: asString(data.creator_notes),
      tags: asStringArray(data.tags),
      category: undefined,
      version: asString(data.character_version, "1.0.0"),
      spec: "chara_card_v3",
      creator: asString(data.creator),
      source: "imported_ccv3",
      isGlobal: true,
      lorebookEntries: entries,
      chatDefaults: characterBook
        ? {
            scanDepth: characterBook.scan_depth ?? 4,
            maxLorebookEntries: Math.max(1, characterBook.entries?.length ?? 6),
            includeExamples: true,
            allowDocumentTools: false,
          }
        : undefined,
      createdAt,
      updatedAt,
    },
  };
}

export function parseCcv3Json(text: string): Ccv3ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON: ${(err as Error).message}`, { cause: err });
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Top-level value is not an object");
  }
  const obj = parsed as Record<string, unknown>;
  const data = asObject(obj.data);
  if (!data) {
    throw new Error("Missing data object");
  }
  const card: Ccv3Card = {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: {
      name: asString(data.name),
      description: asString(data.description),
      personality: asString(data.personality),
      scenario: asString(data.scenario),
      first_mes: asString(data.first_mes),
      mes_example: asString(data.mes_example),
      creator_notes: asString(data.creator_notes),
      system_prompt: asString(data.system_prompt),
      post_history_instructions: asString(data.post_history_instructions),
      alternate_greetings: asStringArray(data.alternate_greetings),
      tags: asStringArray(data.tags),
      creator: asString(data.creator),
      character_version: asString(data.character_version, "1.0.0"),
      extensions: asObject(data.extensions),
      character_book: data.character_book
        ? (() => {
            const book = asObject(data.character_book);
            return {
              name: asString(book.name) || undefined,
              description: asString(book.description) || undefined,
              scan_depth: typeof book.scan_depth === "number" ? book.scan_depth : undefined,
              token_budget: typeof book.token_budget === "number" ? book.token_budget : undefined,
              recursive_scanning: Boolean(book.recursive_scanning),
              entries: Array.isArray(book.entries)
                ? (book.entries as unknown[]).map((e) => {
                    const v = asObject(e);
                    return {
                      id: typeof v.id === "string" || typeof v.id === "number" ? v.id : undefined,
                      keys: asStringArray(v.keys),
                      secondary_keys: asStringArray(v.secondary_keys),
                      comment: asString(v.comment) || undefined,
                      content: asString(v.content),
                      constant: Boolean(v.constant),
                      selective: Boolean(v.selective),
                      insertion_order: typeof v.insertion_order === "number" ? v.insertion_order : 0,
                      enabled: v.enabled !== false,
                      position: v.position === "after_char" ? "after_char" : "before_char",
                      use_regex: Boolean(v.use_regex),
                      case_sensitive: Boolean(v.case_sensitive),
                      priority: typeof v.priority === "number" ? v.priority : 30,
                      probability: typeof v.probability === "number" ? v.probability : 100,
                      extensions: asObject(v.extensions),
                    } as Ccv3LorebookEntry;
                  })
                : [],
            } as Ccv3CharacterBook;
          })()
        : undefined,
    },
    id: typeof obj.id === "string" ? obj.id : undefined,
    creation_date: typeof obj.creation_date === "string" ? obj.creation_date : undefined,
  };
  const warnings: string[] = [];
  if (card.spec !== "chara_card_v3") {
    warnings.push(`Spec field is "${card.spec}" instead of "chara_card_v3".`);
  }
  if (!card.data.name) {
    warnings.push("Card has no name; using \"Unnamed\" fallback.");
  }
  return { card, warnings };
}

// ── PNG chunk embed/extract ─────────────────────────────────────────────────

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = c ^ buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const length = data.length;
  const out = new Uint8Array(4 + 4 + length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, length, false);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crc = crc32(out.slice(4, 8 + length));
  view.setUint32(8 + length, crc, false);
  return out;
}

function readChunkHeader(view: DataView, offset: number): { length: number; type: string; next: number } {
  const length = view.getUint32(offset, false);
  const type = String.fromCharCode(
    view.getUint8(offset + 4),
    view.getUint8(offset + 5),
    view.getUint8(offset + 6),
    view.getUint8(offset + 7),
  );
  return { length, type, next: offset + 8 + length + 4 };
}

export function parseCcv3FromPng(bytes: Uint8Array): Ccv3ParseResult {
  // Validate PNG signature.
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      throw new Error("Not a valid PNG file");
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = PNG_SIGNATURE.length;
  let ccv3Text: string | null = null;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) break;
    const { length, type, next } = readChunkHeader(view, offset);
    if (type === "tEXt" || type === "iTXt" || type === "zTXt") {
      const chunkData = bytes.slice(offset + 8, offset + 8 + length);
      // tEXt: keyword\0text (latin-1)
      if (type === "tEXt") {
        const zeroIdx = chunkData.indexOf(0);
        if (zeroIdx > 0) {
          const keyword = new TextDecoder("latin1").decode(chunkData.slice(0, zeroIdx));
          if (keyword === "chara") {
            ccv3Text = new TextDecoder("utf-8").decode(chunkData.slice(zeroIdx + 1));
            break;
          }
        }
      }
    }
    if (type === "IEND") break;
    offset = next;
  }
  if (!ccv3Text) {
    throw new Error("PNG has no chara CCv3 chunk");
  }
  return parseCcv3Json(ccv3Text);
}

export function embedCcv3InPng(pngBytes: Uint8Array, card: Ccv3Card): Uint8Array {
  if (pngBytes.length < PNG_SIGNATURE.length) {
    throw new Error("Not a valid PNG file");
  }
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (pngBytes[i] !== PNG_SIGNATURE[i]) {
      throw new Error("Not a valid PNG file");
    }
  }
  const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
  let offset = PNG_SIGNATURE.length;
  // Find IEND.
  let iendOffset = -1;
  while (offset < pngBytes.length) {
    if (offset + 8 > pngBytes.length) break;
    const header = readChunkHeader(view, offset);
    const { type, next } = header;
    if (type === "IEND") {
      iendOffset = offset;
      break;
    }
    offset = next;
  }
  if (iendOffset < 0) {
    throw new Error("PNG has no IEND chunk");
  }

  const json = JSON.stringify(card);
  const jsonBytes = new TextEncoder().encode(json);
  // tEXt chunk: "chara" + 0x00 + json bytes (latin-1 keyword, utf-8 text after 0x00)
  const keywordBytes = new TextEncoder().encode("chara");
  const textData = new Uint8Array(keywordBytes.length + 1 + jsonBytes.length);
  textData.set(keywordBytes, 0);
  textData[keywordBytes.length] = 0;
  textData.set(jsonBytes, keywordBytes.length + 1);
  const textChunk = makeChunk("tEXt", textData);

  const head = pngBytes.slice(0, iendOffset);
  const tail = pngBytes.slice(iendOffset);
  const out = new Uint8Array(head.length + textChunk.length + tail.length);
  out.set(head, 0);
  out.set(textChunk, head.length);
  out.set(tail, head.length + textChunk.length);
  return out;
}

export function veyraToCcv3Png(pngBytes: Uint8Array, character: CharacterRecord): Uint8Array {
  const card = veyraToCcv3(character);
  return embedCcv3InPng(pngBytes, card);
}

export function emptyCcv3Card(): Ccv3Card {
  return {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: {
      name: "",
      description: "",
      personality: "",
      scenario: "",
      first_mes: "",
      mes_example: "",
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      tags: [],
      creator: "",
      character_version: "1.0.0",
      extensions: {},
    },
  };
}
