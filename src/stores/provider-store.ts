import { create } from "zustand";
import type { ModelInfo, ProviderInfo } from "@/lib/chat-types";
import { getInitialProviders, getProviderAdapter } from "@/lib/providers";

type ProviderStore = {
  providers: ProviderInfo[];
  selectedProvider: string;
  models: ModelInfo[];
  selectedModel: string;
  initializeProvider: () => Promise<void>;
  selectProvider: (providerId: string) => Promise<void>;
  setSelectedModel: (modelId: string) => void;
};

export const useProviderStore = create<ProviderStore>((set, get) => ({
  providers: getInitialProviders(),
  selectedProvider: "lm-studio",
  models: [],
  selectedModel: "",
  initializeProvider: async () => {
    await get().selectProvider(get().selectedProvider);
  },
  selectProvider: async (providerId) => {
    set({ selectedProvider: providerId, selectedModel: "", models: [] });
    const adapter = getProviderAdapter(providerId);
    if (!adapter) return;

    const running = await adapter.isAvailable();
    set((state) => ({
      providers: state.providers.map((provider) =>
        provider.id === providerId
          ? { ...provider, status: running ? "connected" : "disconnected" }
          : provider,
      ),
    }));

    if (!running) return;
    const models = await adapter.fetchModels();
    set({ models, selectedModel: models[0]?.id ?? "" });
  },
  setSelectedModel: (modelId) => set({ selectedModel: modelId }),
}));
