import { create } from "zustand";
import type { ModelInfo, ProviderInfo } from "@/lib/chat-types";
import { getInitialProviders, getProviderAdapter } from "@/lib/providers";

export type ProviderConnectionPhase = "idle" | "connecting" | "error";

const PROVIDER_STORAGE_KEY = "veyra.provider.v1";
const MODEL_CACHE_KEY = "veyra.models.cache.v1";
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

type ProviderPrefs = {
  selectedProvider: string;
  selectedModelByProvider: Record<string, string>;
};

type ModelCacheEntry = {
  providerId: string;
  models: ModelInfo[];
  cachedAt: number;
};

const DEFAULT_PREFS: ProviderPrefs = {
  selectedProvider: "lm-studio",
  selectedModelByProvider: {},
};

function loadPrefs(): ProviderPrefs {
  try {
    const raw = localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS, selectedModelByProvider: {} };
    const parsed = JSON.parse(raw) as Partial<ProviderPrefs>;
    return {
      selectedProvider: parsed.selectedProvider ?? DEFAULT_PREFS.selectedProvider,
      selectedModelByProvider: parsed.selectedModelByProvider ?? {},
    };
  } catch {
    return { ...DEFAULT_PREFS, selectedModelByProvider: {} };
  }
}

function savePrefs(prefs: ProviderPrefs): void {
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable
  }
}

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

function preferredModelForProvider(providerId: string): string {
  return loadPrefs().selectedModelByProvider[providerId] ?? "";
}

function persistModelChoice(providerId: string, modelId: string): void {
  if (!modelId) return;
  const prefs = loadPrefs();
  prefs.selectedProvider = providerId;
  prefs.selectedModelByProvider[providerId] = modelId;
  savePrefs(prefs);
}

const initialPrefs = loadPrefs();
const initialCachedModels = loadCachedModels(initialPrefs.selectedProvider);
const initialSelectedModel = initialCachedModels?.length
  ? resolveModelId(initialCachedModels, preferredModelForProvider(initialPrefs.selectedProvider))
  : preferredModelForProvider(initialPrefs.selectedProvider);

let providerRequestSeq = 0;
let providerReadyPromise: Promise<void> | null = null;

type ProviderStore = {
  providers: ProviderInfo[];
  selectedProvider: string;
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
  providerId: string,
  models: ModelInfo[],
  currentModelId: string,
): string {
  const preferred = currentModelId || preferredModelForProvider(providerId);
  const selectedModel = resolveModelId(models, preferred);
  persistModelChoice(providerId, selectedModel);
  saveCachedModels(providerId, models);
  return selectedModel;
}

async function fetchProviderModels(providerId: string, currentModelId: string): Promise<void> {
  const requestId = ++providerRequestSeq;
  const preferred = preferredModelForProvider(providerId);

  useProviderStore.setState({
    selectedProvider: providerId,
    selectedModel: preferred || currentModelId,
    connectionPhase: "idle",
    connectionError: null,
  });

  savePrefs({
    selectedProvider: providerId,
    selectedModelByProvider: {
      ...loadPrefs().selectedModelByProvider,
      ...(preferred ? { [providerId]: preferred } : {}),
    },
  });

  const { available } = await syncProviderConnection(providerId, {});
  const adapter = getProviderAdapter(providerId);
  if (requestId !== providerRequestSeq || useProviderStore.getState().selectedProvider !== providerId) {
    return;
  }

  useProviderStore.setState((state) => ({
    providers: state.providers.map((provider) =>
      provider.id === providerId
        ? { ...provider, status: available ? "connected" : "disconnected" }
        : provider,
    ),
  }));

  if (!available || !adapter) return;

  const models = await adapter.fetchModels();
  if (requestId !== providerRequestSeq || useProviderStore.getState().selectedProvider !== providerId) {
    return;
  }
  const selectedModel = applyFetchedModels(providerId, models, useProviderStore.getState().selectedModel);
  useProviderStore.setState({ models, selectedModel });
}

export const useProviderStore = create<ProviderStore>((set, get) => ({
  providers: getInitialProviders(),
  selectedProvider: initialPrefs.selectedProvider,
  models: initialCachedModels ?? [],
  selectedModel: initialSelectedModel,
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

    providerReadyPromise = fetchProviderModels(providerId, get().selectedModel).finally(() => {
      providerReadyPromise = null;
    });
    await providerReadyPromise;
  },

  selectProvider: async (providerId) => {
    providerRequestSeq += 1;
    const cached = loadCachedModels(providerId);
    const preferred = preferredModelForProvider(providerId);
    set({
      selectedProvider: providerId,
      selectedModel: preferred,
      models: cached ?? [],
      connectionPhase: "idle",
      connectionError: null,
    });
    providerReadyPromise = fetchProviderModels(providerId, preferred).finally(() => {
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

    set((state) => ({
      providers: state.providers.map((provider) =>
        provider.id === id
          ? { ...provider, status: available ? "connected" : "disconnected" }
          : provider,
      ),
      connectionPhase: available ? "idle" : "error",
      connectionError: available
        ? null
        : (message ?? `${adapter.name} could not be reached.`),
      ...(id === state.selectedProvider && !available
        ? { models: [], selectedModel: preferredModelForProvider(id) }
        : {}),
    }));

    if (!available) return;

    const models = await adapter.fetchModels();
    if (requestId !== providerRequestSeq || id !== get().selectedProvider) return;
    if (id === get().selectedProvider) {
      const selectedModel = applyFetchedModels(id, models, get().selectedModel);
      set({ models, selectedModel });
    }
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

    set((state) => ({
      providers: state.providers.map((provider) =>
        provider.id === id
          ? { ...provider, status: available ? "connected" : "disconnected" }
          : provider,
      ),
      connectionPhase: available ? "idle" : "error",
      connectionError: available
        ? null
        : (message ?? `Could not start ${adapter.name}.`),
    }));

    if (!available) {
      if (id === get().selectedProvider) {
        set({ models: [], selectedModel: preferredModelForProvider(id) });
      }
      return;
    }

    const models = await adapter.fetchModels();
    if (requestId !== providerRequestSeq || id !== get().selectedProvider) return;
    if (id === get().selectedProvider) {
      const selectedModel = applyFetchedModels(id, models, get().selectedModel);
      set({ models, selectedModel });
    }
  },

  setSelectedModel: (modelId) => {
    const providerId = get().selectedProvider;
    persistModelChoice(providerId, modelId);
    set({ selectedModel: modelId });
  },
}));
