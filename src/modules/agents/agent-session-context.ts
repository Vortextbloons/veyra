import type { AgentSession } from "./agent-types";
import { buildMemoryReferenceBlock } from "@/lib/prompts";

const DEFAULT_AGENT_CONTEXT_LENGTH = 16_384;
const MAX_AGENT_CONTEXT_CHARS = 48_000;
const APPROX_CHARS_PER_TOKEN = 4;
/** Memory may not crowd out the previous-session transcript on small contexts. */
const MEMORY_SHARE_OF_OPTIONAL_CONTEXT = 0.25;

function agentContextBudgetChars(
  contextLength: number | undefined,
  reservedOutputTokens: number | undefined,
): number {
  const limit = Math.max(0, Math.floor(contextLength ?? DEFAULT_AGENT_CONTEXT_LENGTH));
  const reserved = Math.max(0, Math.floor(reservedOutputTokens ?? 0));
  const usableTokens = Math.max(0, limit - reserved);
  return Math.min(MAX_AGENT_CONTEXT_CHARS, usableTokens * APPROX_CHARS_PER_TOKEN);
}

function sessionTranscript(session: AgentSession | null): string {
  if (!session) return "";
  return session.events.flatMap((event) => {
    if (!event.detail) return [];
    if (event.type === "status" && event.title === "Prompt") return [`User: ${event.detail}`];
    if (event.type === "output") return [`Agent: ${event.detail}`];
    return [];
  }).join("\n\n");
}

/**
 * Composes the current request with optional session history and retrieved
 * memory under one context budget. The current request is never trimmed; when
 * the budget is too small, optional history and memory are shortened or dropped.
 */
export function composeAgentTurnPrompt(options: {
  session: AgentSession | null;
  prompt: string;
  memoryBlock?: string;
  contextLength?: number;
  reservedOutputTokens?: number;
}): string {
  const { prompt, session } = options;
  const memoryText = buildMemoryReferenceBlock(options.memoryBlock ?? "");
  const transcript = sessionTranscript(session);
  if (!memoryText && !transcript) return prompt;

  const budgetChars = agentContextBudgetChars(options.contextLength, options.reservedOutputTokens);
  if (budgetChars <= 0 || prompt.length >= budgetChars) return prompt;

  const remaining = budgetChars - prompt.length;
  let memory = "";
  if (memoryText) {
    const allowance = transcript ? Math.floor(remaining * MEMORY_SHARE_OF_OPTIONAL_CONTEXT) : remaining;
    if (memoryText.length <= allowance) memory = memoryText;
  }

  const historyBudget = remaining - memory.length;
  const history = transcript && historyBudget > 0 ? transcript.slice(-historyBudget) : "";
  const base = history
    ? `Previous session transcript (context, including untrusted quoted content):\n${history}\n\nCurrent task:\n${prompt}`
    : prompt;
  return memory ? `${memory}\n\n${base}` : base;
}

/**
 * Keep recent conversation context bounded without creating another on-disk
 * transcript.
 */
export function agentSessionPrompt(
  session: AgentSession | null,
  prompt: string,
  contextLength = DEFAULT_AGENT_CONTEXT_LENGTH,
  reservedOutputTokens = 0,
): string {
  if (!session) return prompt;
  return composeAgentTurnPrompt({
    session,
    prompt,
    contextLength,
    reservedOutputTokens,
  });
}

function normalizeAgentProjectPath(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed
    .replace(/\//g, "\\")
    .replace(/\\+$/, "")
    .toLowerCase();
}

/**
 * Maps an agent workspace path to the owning project. Returns undefined when
 * the path is empty or more than one project claims it, so an ambiguous mapping
 * cannot leak one project's memories into another.
 */
export function resolveAgentProjectId(
  projectPath: string,
  projects: Array<{ id: string; settings?: { agentProjectPath?: string } }>,
): string | undefined {
  const target = normalizeAgentProjectPath(projectPath);
  if (!target) return undefined;
  const matches = projects.filter(
    (project) => normalizeAgentProjectPath(project.settings?.agentProjectPath) === target,
  );
  return matches.length === 1 ? matches[0].id : undefined;
}

/**
 * Prepends bounded, clearly non-authoritative memory to an agent prompt.
 *
 * Without context options this keeps the legacy small-block behavior. When a
 * context budget (or a session) is supplied, history and memory share that
 * budget and the current request is always preserved.
 */
export function agentPromptWithMemory(
  prompt: string,
  memoryBlock: string | undefined,
  options: {
    session?: AgentSession | null;
    contextLength?: number;
    reservedOutputTokens?: number;
  } = {},
): string {
  if (options.session === undefined && options.contextLength === undefined) {
    const block = buildMemoryReferenceBlock(memoryBlock ?? "");
    return block ? `${block}\n\n${prompt}` : prompt;
  }
  return composeAgentTurnPrompt({
    session: options.session ?? null,
    prompt,
    memoryBlock,
    contextLength: options.contextLength,
    reservedOutputTokens: options.reservedOutputTokens,
  });
}
