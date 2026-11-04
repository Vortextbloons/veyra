import { afterEach, expect, it, vi } from "vitest";

const { fetchModels, allowed } = vi.hoisted(() => ({
  fetchModels: vi.fn(), allowed: vi.fn(() => true),
}));
vi.mock("@/lib/providers", () => ({
  configureCloudProviderAdapters: vi.fn(),
  getInitialProviders: () => [{ id: "lm-studio", name: "LM Studio" }],
  getProviderAdapter: () => ({ name: "LM Studio", isAvailable: async () => true, fetchModels }),
}));
vi.mock("@/lib/connectivity/provider-connectivity", () => ({ isProviderAllowedForConnectivity: allowed }));

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });

it("refreshes a cached model list on launch while preserving the selected model", async () => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  const oldModel = { id: "existing", name: "Existing" };
  const newModel = { id: "new", name: "New" };
  data.set("veyra.models.cache.v1", JSON.stringify([{ providerId: "lm-studio", models: [oldModel], cachedAt: Date.now() }]));
  fetchModels.mockResolvedValue([oldModel, newModel]);
  const { useProviderStore } = await import("@/stores/provider-store");
  await useProviderStore.getState().ensureProviderReady();
  expect(fetchModels).not.toHaveBeenCalled();
  await useProviderStore.getState().ensureProviderReady(true);
  expect(fetchModels).toHaveBeenCalledTimes(1);
  expect(useProviderStore.getState().models.map((model) => model.id)).toEqual(["existing", "new"]);
  expect(useProviderStore.getState().selectedModel).toBe("existing");
  allowed.mockReturnValueOnce(false);
  await useProviderStore.getState().ensureProviderReady(true);
  expect(fetchModels).toHaveBeenCalledTimes(1);
});
