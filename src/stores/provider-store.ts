import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ModelInfo, ProviderInfo } from "@/lib/chat-types";
import { getInitialProviders, getProviderAdapter } from "@/lib/providers";

export type ProviderConnectionPhase = "idle" | "connecting" | "error";

const PROVIDER_STORAGE_KEY = "veyra.provider.v1";
const MODEL_CACHE_KEY = "veyra.models.cache.v1";
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

type ProviderStore = {
  selectedProvider: string;
  selectedModelByProvider: Record<string, string>;
  providers: ProviderInfo[];
  models: ModelInfo[];
  selectedModel: string;
  connectionPhase: ProviderConnectionPhase;
  connectionError: string | null;
  initializeProvider: () => void;
  ensureProviderReady: () => Promise<void>;
  selectProvider: (providerId: string) => Promise<void>;
  reconnectProvider: (providerId?: string) => Promise<void>;
  startProviderServer: (providerId?: string) => Promise<void>;
  setSelectedModel: (modelId: string) => void;
};

type ModelCacheEntry = {
  providerId: string;
  models: ModelInfo[];
  cachedAt: number;
};

const DEFAULT_PROVIDER = "lm-studio";

function loadCachedModels(providerId: string): ModelInfo[] | null {
  try {
    const raw = localStorage.getItem(MODEL_CACHE_KEY);
    if (!raw) return null;
    const entries = JSON.parse(raw) as ModelCacheEntry[];
    const entry = entries.find((item) => item.providerId === providerId);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > MODEL_CACHE_TTL_MS) return null;
    return entry.models;
  } catch {
    return null;
  }
}

function saveCachedModels(providerId: string, models: ModelInfo[]): void {
  try {
    const raw = localStorage.getItem(MODEL_CACHE_KEY);
    const entries = raw ? (JSON.parse(raw) as ModelCacheEntry[]) : [];
    const next = entries.filter((item) => item.providerId !== providerId);
    next.push({ providerId, models, cachedAt: Date.now() });
    localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable
  }
}

function resolveModelId(models: ModelInfo[], preferredId: string): string {
  if (preferredId && models.some((model) => model.id === preferredId)) {
    return preferredId;
  }
  return models[0]?.id ?? "";
}

function preferredModelForProvider(state: ProviderStore, providerId: string): string {
  return state.selectedModelByProvider[providerId] ?? "";
}

function persistModelChoice(
  set: (partial: Partial<ProviderStore>) => void,
  get: () => ProviderStore,
  providerId: string,
  modelId: string,
): void {
  if (!modelId) return;
  const selectedModelByProvider = {
    ...get().selectedModelByProvider,
    [providerId]: modelId,
  };
  set({ selectedProvider: providerId, selectedModelByProvider, selectedModel: modelId });
}

let providerRequestSeq = 0;
let providerReadyPromise: Promise<void> | null = null;

async function syncProviderConnection(
  providerId: string,
  options: { startServer?: boolean },
): Promise<{ available: boolean; message?: string }> {
  const adapter = getProviderAdapter(providerId);
  if (!adapter) return { available: false, message: "Unknown provider." };

  if (options.startServer && adapter.startServer) {
    const result = await adapter.startServer();
    return { available: result.success, message: result.message };
  }

  if (adapter.reconnect) {
    const result = await adapter.reconnect();
    return { available: result.success, message: result.message };
  }

  const available = await adapter.isAvailable();
  return {
    available,
    message: available ? undefined : `${adapter.name} is not available.`,
  };
}

function applyFetchedModels(
  get: () => ProviderStore,
  set: (partial: Partial<ProviderStore>) => void,
  providerId: string,
  models: ModelInfo[],
  currentModelId: string,
): string {
  const preferred = currentModelId || preferredModelForProvider(get(), providerId);
  const selectedModel = resolveModelId(models, preferred);
  persistModelChoice(set, get, providerId, selectedModel);
  saveCachedModels(providerId, models);
  return selectedModel;
}

async function fetchProviderModels(
  get: () => ProviderStore,
  set: (partial: Partial<ProviderStore>) => void,
  providerId: string,
  currentModelId: string,
): Promise<void> {
  const requestId = ++providerRequestSeq;
  const preferred = preferredModelForProvider(get(), providerId);

  set({
    selectedProvider: providerId,
    selectedModel: preferred || currentModelId,
    connectionPhase: "idle",
    connectionError: null,
  });

  const { available } = await syncProviderConnection(providerId, {});
  const adapter = getProviderAdapter(providerId);
  if (requestId !== providerRequestSeq || get().selectedProvider !== providerId) {
    return;
  }

  set({
    providers: get().providers.map((provider) =>
      provider.id === providerId
        ? { ...provider, status: available ? "connected" : "disconnected" }
        : provider,
    ),
  });

  if (!available || !adapter) return;

  const models = await adapter.fetchModels();
  if (requestId !== providerRequestSeq || get().selectedProvider !== providerId) {
    return;
  }
  const selectedModel = applyFetchedModels(get, set, providerId, models, get().selectedModel);
  set({ models, selectedModel });
}

function applyProviderConnectionResult(
  set: (fn: (state: ProviderStore) => Partial<ProviderStore>) => void,
  id: string,
  available: boolean,
  errorMessage: string,
) {
  set((state) => ({
    providers: state.providers.map((provider) =>
      provider.id === id
        ? { ...provider, status: available ? "connected" : "disconnected" }
        : provider,
    ),
    connectionPhase: available ? "idle" : "error",
    connectionError: available ? null : errorMessage,
    ...(id === state.selectedProvider && !available
      ? { models: [], selectedModel: preferredModelForProvider(state, id) }
      : {}),
  }));
}

async function loadProviderModelsIfSelected(
  id: string,
  requestId: number,
  get: () => ProviderStore,
  set: (partial: Partial<ProviderStore>) => void,
) {
  if (requestId !== providerRequestSeq || id !== get().selectedProvider) return;
  const adapter = getProviderAdapter(id);
  if (!adapter) return;
  const models = await adapter.fetchModels();
  if (requestId !== providerRequestSeq || id !== get().selectedProvider) return;
  if (id === get().selectedProvider) {
    const selectedModel = applyFetchedModels(get, set, id, models, get().selectedModel);
    set({ models, selectedModel });
  }
}

export const useProviderStore = create<ProviderStore>()(
  persist(
    (set, get) => ({
      selectedProvider: DEFAULT_PROVIDER,
      selectedModelByProvider: {},
      providers: getInitialProviders(),
      models: [],
      selectedModel: "",
      connectionPhase: "idle",
      connectionError: null,

      initializeProvider: () => {
        const providerId = get().selectedProvider;
        const cached = loadCachedModels(providerId);
        if (!cached?.length) return;
        const selectedModel = resolveModelId(cached, get().selectedModel);
        set({ models: cached, selectedModel });
      },

      ensureProviderReady: async () => {
        const providerId = get().selectedProvider;
        const cached = loadCachedModels(providerId);
        if (cached?.length) {
          const selectedModel = resolveModelId(cached, get().selectedModel);
          set({ models: cached, selectedModel });
          return;
        }

        if (providerReadyPromise) {
          await providerReadyPromise;
          return;
        }

        providerReadyPromise = fetchProviderModels(get, set, providerId, get().selectedModel).finally(
          () => {
            providerReadyPromise = null;
          },
        );
        await providerReadyPromise;
      },

      selectProvider: async (providerId) => {
        providerRequestSeq += 1;
        const cached = loadCachedModels(providerId);
        const preferred = preferredModelForProvider(get(), providerId);
        set({
          selectedProvider: providerId,
          selectedModel: preferred,
          models: cached ?? [],
          connectionPhase: "idle",
          connectionError: null,
        });
        providerReadyPromise = fetchProviderModels(get, set, providerId, preferred).finally(() => {
          providerReadyPromise = null;
        });
        await providerReadyPromise;
      },

      reconnectProvider: async (providerId) => {
        const requestId = ++providerRequestSeq;
        const id = providerId ?? get().selectedProvider;
        const adapter = getProviderAdapter(id);
        if (!adapter) return;

        set({ connectionPhase: "connecting", connectionError: null });

        const { available, message } = await syncProviderConnection(id, {});
        if (requestId !== providerRequestSeq || id !== get().selectedProvider) return;

        applyProviderConnectionResult(
          set,
          id,
          available,
          message ?? `${adapter.name} could not be reached.`,
        );
        if (!available) return;

        await loadProviderModelsIfSelected(id, requestId, get, set);
      },

      startProviderServer: async (providerId) => {
        const requestId = ++providerRequestSeq;
        const id = providerId ?? get().selectedProvider;
        const adapter = getProviderAdapter(id);
        if (!adapter) return;

        if (!adapter.startServer) {
          await get().reconnectProvider(id);
          return;
        }

        set({ connectionPhase: "connecting", connectionError: null });

        const { available, message } = await syncProviderConnection(id, { startServer: true });
        if (requestId !== providerRequestSeq || id !== get().selectedProvider) return;

        applyProviderConnectionResult(
          set,
          id,
          available,
          message ?? `Could not start ${adapter.name}.`,
        );
        if (!available) return;

        await loadProviderModelsIfSelected(id, requestId, get, set);
      },

      setSelectedModel: (modelId) => {
        persistModelChoice(set, get, get().selectedProvider, modelId);
      },
    }),
    {
      name: PROVIDER_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedProvider: state.selectedProvider,
        selectedModelByProvider: state.selectedModelByProvider,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<ProviderStore>),
        providers: current.providers,
        models: current.models,
        selectedModel:
          (persisted as Partial<ProviderStore>).selectedModelByProvider?.[
            (persisted as Partial<ProviderStore>).selectedProvider ?? DEFAULT_PROVIDER
          ] ?? current.selectedModel,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const cached = loadCachedModels(state.selectedProvider);
        if (cached?.length) {
          const preferred = preferredModelForProvider(state, state.selectedProvider);
          state.models = cached;
          state.selectedModel = resolveModelId(cached, preferred || state.selectedModel);
        } else {
          state.selectedModel = preferredModelForProvider(state, state.selectedProvider);
        }
      },
    },
  ),
);
