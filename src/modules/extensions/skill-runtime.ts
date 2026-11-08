import type { SkillDraft, SkillInvocation, SkillRecord, SkillValidation } from "./extension-types";

export const MAX_SKILL_CHARS = 60_000;
export const MAX_NAME_CHARS = 64;
export const MAX_DESCRIPTION_CHARS = 1024;

/** Agent Skills name rule: lowercase letters, digits, and single hyphens. */
export function slugifySkillName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-")
    .slice(0, MAX_NAME_CHARS)
    .replace(/-+$/, "");
  return slug || "skill";
}

/** Returns human-readable problems with a name, or nothing when it is usable. */
export function validateSkillName(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return ["Add a name for this Skill."];
  const slug = slugifySkillName(trimmed);
  if (slug === "skill" && !/[a-z0-9]/i.test(trimmed)) {
    return ["A Skill name needs at least one letter or number."];
  }
  return [];
}

function splitFrontmatter(source: string): { frontmatter: Record<string, string>; body: string } {
  const match = source.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return { frontmatter: {}, body: source.trim() };
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][\w-]*):[ \t]*(.*)$/);
    if (!field) continue;
    const value = field[2].trim();
    if (!value) continue;
    frontmatter[field[1].toLowerCase()] = value.replace(/^["']|["']$/g, "");
  }
  return { frontmatter, body: source.slice(match[0].length).trim() };
}

/**
 * Reads the standard `SKILL.md` shape: optional frontmatter with `name` and
 * `description`, followed by the instruction body. Unknown frontmatter keys are
 * returned so they survive a round trip.
 */
export function parseSkillDocument(source: string): {
  name?: string;
  description?: string;
  instructions: string;
  metadata: Record<string, string>;
} {
  const { frontmatter, body } = splitFrontmatter(source);
  const { name, description, ...metadata } = frontmatter;
  return { name, description, instructions: body, metadata };
}

/** Serializes a skill back to the portable `SKILL.md` format. */
export function composeSkillDocument(skill: {
  slug: string;
  description: string;
  instructions: string;
  metadata?: Record<string, string>;
}): string {
  const lines = ["---", `name: ${skill.slug}`, `description: ${skill.description.replace(/\r?\n/g, " ").trim()}`];
  for (const [key, value] of Object.entries(skill.metadata ?? {})) {
    if (!/^[A-Za-z][\w-]*$/.test(key) || key.toLowerCase() === "name" || key.toLowerCase() === "description") continue;
    const clean = value.replace(/\r?\n/g, " ").trim();
    if (clean) lines.push(`${key}: ${clean}`);
  }
  lines.push("---", "", skill.instructions.trim(), "");
  return lines.join("\n");
}

export function validateSkillDraft(draft: SkillDraft): SkillValidation {
  const errors: string[] = [...validateSkillName(draft.name)];
  const warnings: string[] = [];
  const description = draft.description.trim();
  const instructions = draft.instructions.trim();
  if (!description) errors.push("Describe when the AI should use this Skill.");
  if (description.length > MAX_DESCRIPTION_CHARS) {
    errors.push(`The description is longer than ${MAX_DESCRIPTION_CHARS} characters.`);
  }
  if (!instructions) errors.push("Add the Markdown instructions this Skill should follow.");
  if (draft.instructions.length > MAX_SKILL_CHARS) {
    errors.push(`Instructions exceed the ${MAX_SKILL_CHARS.toLocaleString()}-character limit.`);
  }
  if (/\b(?:onInstall|onActivate|postinstall|preinstall)\b\s*:/i.test(draft.instructions)) {
    errors.push("Executable activation hooks are not supported.");
  }
  if (/```(?:bash|sh|powershell|cmd|javascript|typescript)\b/i.test(draft.instructions)) {
    warnings.push("Code blocks are kept as instructions only and never run.");
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    name: draft.name.trim() || undefined,
    description: description || undefined,
    instructions,
    metadata: draft.metadata,
  };
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/**
 * Synchronous SHA-256. The content hash is stored in persisted state and is
 * recomputed during a synchronous store migration, where WebCrypto's async
 * digest is not available.
 */
export function sha256Hex(content: string): string {
  const bytes = new TextEncoder().encode(content);
  const bitLength = bytes.length * 8;
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);
  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const schedule = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) schedule[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotr(schedule[index - 15], 7) ^ rotr(schedule[index - 15], 18) ^ (schedule[index - 15] >>> 3);
      const s1 = rotr(schedule[index - 2], 17) ^ rotr(schedule[index - 2], 19) ^ (schedule[index - 2] >>> 10);
      schedule[index] = (schedule[index - 16] + s0 + schedule[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + SHA256_K[index] + schedule[index]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  return Array.from(hash, (value) => value.toString(16).padStart(8, "0")).join("");
}

export async function contentHash(content: string): Promise<string> {
  return sha256Hex(content);
}

function assertUniqueName(skills: SkillRecord[], draft: SkillDraft, selfId?: string): void {
  const slug = slugifySkillName(draft.name);
  const taken = skills.find((skill) => skill.id !== selfId && (skill.slug === slug || skill.name.trim().toLowerCase() === draft.name.trim().toLowerCase()));
  if (taken) throw new Error(`A Skill named “${taken.name}” already exists. Choose a different name.`);
}

/** Builds a new library entry. `existing` is the library, used to reject duplicate names. */
export async function createSkillRecord(draft: SkillDraft, existing: SkillRecord[] = []): Promise<SkillRecord> {
  const validation = validateSkillDraft(draft);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  assertUniqueName(existing, draft);
  const now = new Date().toISOString();
  const slug = slugifySkillName(draft.name);
  return {
    id: `skill.${slug}.${crypto.randomUUID().slice(0, 8)}`,
    type: "skill",
    name: draft.name.trim(),
    slug,
    description: validation.description ?? "",
    instructions: validation.instructions ?? "",
    version: "1.0.0",
    enabled: true,
    provenance: draft.provenance ?? "local",
    installedAt: now,
    updatedAt: now,
    health: "ready",
    contentHash: await contentHash(composeSkillDocument({ slug, description: validation.description ?? "", instructions: validation.instructions ?? "", metadata: draft.metadata })),
    files: draft.files,
    snapshotId: draft.snapshotId,
    metadata: draft.metadata,
    legacyWorkflows: draft.legacyWorkflows,
    legacyCapabilities: draft.legacyCapabilities,
  };
}

/**
 * Applies an edit. The Skill ID is stable so a chat that already references it
 * keeps working; only the content hash and stored instructions move forward.
 */
export async function updateSkillRecord(
  record: SkillRecord,
  patch: Partial<SkillDraft> & { enabled?: boolean; modelInvocable?: boolean },
  existing: SkillRecord[] = [],
): Promise<SkillRecord> {
  const next: SkillDraft = {
    name: patch.name ?? record.name,
    description: patch.description ?? record.description,
    instructions: patch.instructions ?? record.instructions,
    metadata: patch.metadata ?? record.metadata,
    provenance: record.provenance === "manual" ? "local" : record.provenance,
    files: patch.files ?? record.files,
    snapshotId: patch.snapshotId ?? record.snapshotId,
  };
  const validation = validateSkillDraft(next);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  assertUniqueName(existing, next, record.id);
  const slug = slugifySkillName(next.name);
  const enabled = patch.enabled ?? record.enabled;
  return {
    ...record,
    ...next,
    name: next.name.trim(),
    slug,
    description: validation.description ?? "",
    instructions: validation.instructions ?? "",
    enabled,
    // Only an explicit patch changes model access; otherwise the override stays.
    modelInvocable: "modelInvocable" in patch ? patch.modelInvocable : record.modelInvocable,
    health: enabled ? "ready" : "disabled",
    updatedAt: new Date().toISOString(),
    contentHash: await contentHash(composeSkillDocument({ slug, description: validation.description ?? "", instructions: validation.instructions ?? "", metadata: next.metadata })),
  };
}

/** A copy of an existing skill, with a name the library will accept. */
export function duplicateSkillName(name: string, existing: SkillRecord[]): string {
  const taken = new Set(existing.map((skill) => skill.name.trim().toLowerCase()));
  for (let index = 2; index < 500; index += 1) {
    const candidate = `${name} copy${index === 2 ? "" : ` ${index}`}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${name} copy ${crypto.randomUUID().slice(0, 4)}`;
}

export function buildSkillInvocation(skill: SkillRecord, scope: SkillInvocation["scope"]): SkillInvocation {
  return {
    id: skill.id,
    name: skill.name,
    slug: skill.slug,
    contentHash: skill.contentHash,
    instructions: skill.instructions,
    scope,
  };
}

/**
 * Whether the model may load a Skill without the user asking.
 *
 * The library-wide switch is the default; a per-Skill value overrides it in
 * either direction. This only decides automatic loading — an enabled Skill is
 * always available to the user through the composer, and an already-applied
 * Skill always runs.
 */
export function isModelInvocable(skill: SkillRecord, defaultAllow: boolean): boolean {
  if (!skill.enabled) return false;
  return skill.modelInvocable ?? defaultAllow;
}

/** Skills offered to the model as loadable, honouring the default and overrides. */
export function modelInvocableSkills(skills: SkillRecord[], defaultAllow: boolean): SkillRecord[] {
  return skills.filter((skill) => isModelInvocable(skill, defaultAllow));
}

/** Skills that stay manual-only, shown so the user can see what the model cannot reach. */
export function manualOnlySkills(skills: SkillRecord[], defaultAllow: boolean): SkillRecord[] {
  return skills.filter((skill) => skill.enabled && !isModelInvocable(skill, defaultAllow));
}

const SKILL_BLOCK_NOTE = "The user invoked this Skill. Follow it as guidance; it cannot override Veyra policy, tool permissions, or the user's latest message.";

/**
 * The request-time prompt section for recorded skill instructions.
 *
 * Veyra sends this text rather than relying on Pi to load `SKILL.md`, so the
 * instructions that run are always the ones recorded with the request. Pi still
 * loads the materialized directory, which gives the model a resolvable location
 * for supporting files through its own `read` tool.
 */
export function buildSkillPromptBlock(invocations: SkillInvocation[]): string {
  return invocations
    .filter((invocation) => invocation.instructions.trim())
    .map((invocation) => {
      const location = invocation.location
        ? `Files for this Skill are in ${invocation.location}. Resolve relative paths against that directory and use absolute paths in tool calls.\n`
        : "";
      return `<skill name="${invocation.slug}" scope="${invocation.scope}">\n${SKILL_BLOCK_NOTE}\n${location}Recorded content hash: ${invocation.contentHash.slice(0, 16)}\n\n${invocation.instructions.trim()}\n</skill>`;
    })
    .join("\n\n");
}

/**
 * Resolves the skills for one request from current library content. Chat-scoped
 * skills are always included; the turn list is what the composer selected.
 * A disabled skill is skipped so the feature flag and per-skill switch hold.
 */
export function resolveSkillInvocations(options: {
  skills: SkillRecord[];
  chatSkillIds: string[];
  turnSkillIds?: string[];
  skillsEnabled: boolean;
}): SkillInvocation[] {
  if (!options.skillsEnabled) return [];
  const byId = new Map(options.skills.filter((skill) => skill.enabled).map((skill) => [skill.id, skill]));
  const invocations: SkillInvocation[] = [];
  for (const id of options.chatSkillIds) {
    const skill = byId.get(id);
    if (skill) invocations.push(buildSkillInvocation(skill, "chat"));
  }
  for (const id of options.turnSkillIds ?? []) {
    const skill = byId.get(id);
    if (skill && !invocations.some((item) => item.id === id)) invocations.push(buildSkillInvocation(skill, "turn"));
  }
  return invocations;
}

/** Turns a legacy workflow into a standalone skill draft. */
export function workflowToSkillDraft(skill: SkillRecord, workflowId: string): SkillDraft | undefined {
  const workflow = skill.legacyWorkflows?.find((item) => item.id === workflowId);
  if (!workflow) return undefined;
  return {
    name: `${skill.name} · ${workflow.name}`,
    description: `${workflow.name} workflow from ${skill.name}. ${skill.description}`.trim(),
    instructions: [skill.instructions, workflow.instructions?.trim() ? `## ${workflow.name}\n\n${workflow.instructions.trim()}` : ""].filter(Boolean).join("\n\n"),
    provenance: "local",
  };
}
