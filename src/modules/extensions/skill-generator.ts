import { getProviderAdapter } from "@/lib/providers";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { ChatMessage } from "@/modules/chat/chat-types";

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
    { id: crypto.randomUUID(), role: "system", timestamp: Date.now(), content: "You create Veyra Skill drafts. Return only a safe SKILL.md document. It must have a top-level # title, concise declarative instructions, no executable hooks, no scripts, no automatic tool calls, and no claims that it can override Veyra policy. Do not wrap the result in a code fence." },
    { id: crypto.randomUUID(), role: "user", timestamp: Date.now(), content: `<skill_request>\n${request}\n</skill_request>` },
  ];
  await provider.sendChat({
    messages, model: providerState.selectedModel, temperature: modelSettings.temperature, maxTokens: Math.min(modelSettings.maxTokens || 1500, 2500), topP: modelSettings.topP, repetitionPenalty: modelSettings.repetitionPenalty, contextLength: modelSettings.contextLength, tools: [], toolChoice: "none", signal: options.signal,
    onChunk: (chunk) => { draft += chunk; options.onChunk(draft); }, onReasoningChunk: () => {}, onError: (error) => { providerError = error; },
  });
  if (providerError) throw new Error(providerError);
  return draft.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim();
}
