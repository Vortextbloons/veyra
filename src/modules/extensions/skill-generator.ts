import { getProviderAdapter } from "@/lib/providers";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { ChatMessage } from "@/modules/chat/chat-types";

const GENERATION_SYSTEM = `You write Skill instructions for Veyra, a desktop AI assistant.

Return only a portable SKILL.md document:
- Start with YAML frontmatter containing exactly two fields: name (lowercase letters, digits, and single hyphens) and description (what it does and when to use it, under 1024 characters).
- Then a blank line and a Markdown instruction body: direct, declarative guidance an AI can follow.
- No executable hooks, no install scripts, no tool calls, no claims that it can override Veyra policy.

Do not wrap the document in a code fence.`;

/**
 * Produces a portable `SKILL.md` document so generated Skills use the same
 * format as a manual one and as an imported package.
 */
export async function generateSkillDraft(options: {
  description: string;
  onChunk: (draft: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const request = options.description.trim();
  if (!request) throw new Error("Describe the Skill you want to create.");
  const providerState = useProviderStore.getState();
  const provider = getProviderAdapter(providerState.selectedProvider);
  if (!provider || !providerState.selectedModel) throw new Error("Connect a provider and select a model before generating a Skill.");
  const modelSettings = useSettingsStore.getState().getModelSettings(providerState.selectedModel);
  let draft = "";
  let providerError: string | undefined;
  const messages: ChatMessage[] = [
    { id: crypto.randomUUID(), role: "system", timestamp: Date.now(), content: GENERATION_SYSTEM },
    { id: crypto.randomUUID(), role: "user", timestamp: Date.now(), content: `<skill_request>\n${request}\n</skill_request>` },
  ];
  await provider.sendChat({
    messages, model: providerState.selectedModel, temperature: modelSettings.temperature, maxTokens: Math.min(modelSettings.maxTokens || 1500, 2500), topP: modelSettings.topP, repetitionPenalty: modelSettings.repetitionPenalty, contextLength: modelSettings.contextLength, tools: [], toolChoice: "none", signal: options.signal,
    onChunk: (chunk) => { draft += chunk; options.onChunk(draft); }, onReasoningChunk: () => {}, onError: (error) => { providerError = error; },
  });
  if (providerError) throw new Error(providerError);
  return draft.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim();
}
