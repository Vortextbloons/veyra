import { fetchModels, isServerRunning, sendLmStudioChat } from "@/lib/lm-studio";
import type { ProviderAdapter } from "@/lib/providers/types";

export const lmStudioAdapter: ProviderAdapter = {
  id: "lm-studio",
  name: "LM Studio",
  icon: "local",
  isAvailable: () => isServerRunning(),
  fetchModels: () => fetchModels(),
  sendChat: (options) => sendLmStudioChat(options),
};
