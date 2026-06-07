import {
  ensureServerRunning,
  fetchModels,
  isServerRunning,
  sendLmStudioChat,
} from "@/lib/lm-studio";
import type { ProviderAdapter } from "@/lib/providers/types";

export const lmStudioAdapter: ProviderAdapter = {
  id: "lm-studio",
  name: "LM Studio",
  icon: "lm-studio",
  isAvailable: () => isServerRunning(),
  fetchModels: () => fetchModels(),
  sendChat: (options) =>
    sendLmStudioChat({
      messages: options.messages,
      model: options.model,
      temperature: options.temperature,
      contextLength: options.contextLength,
      maxTokens: options.maxTokens,
      topP: options.topP,
      repetitionPenalty: options.repetitionPenalty,
      stopSequences: options.stopSequences,
      previousResponseId: options.previousResponseId,
      tools: options.tools,
      toolChoice: options.toolChoice,
      signal: options.signal,
      onChunk: options.onChunk,
      onReasoningChunk: options.onReasoningChunk,
      onModelLoadProgress: options.onModelLoadProgress,
      onComplete: options.onComplete,
      onError: options.onError,
    }),
  reconnect: async () => {
    const success = await isServerRunning();
    return {
      success,
      message: success
        ? undefined
        : "LM Studio server is not responding. Try starting the server or check that a model is loaded.",
    };
  },
  startServer: async () => {
    const success = await ensureServerRunning();
    return {
      success,
      message: success
        ? undefined
        : "Could not start LM Studio. Install LM Studio, open it once, then try again (Veyra will use the lms CLI from ~/.lmstudio/bin).",
    };
  },
};
