import { beforeEach, describe, expect, it, vi } from "vitest";

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
});

vi.mock("@/lib/providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/providers")>()),
  getProviderAdapter: () => undefined,
  getInitialProviders: () => [],
}));
vi.mock("@/lib/providers/cloud-config", () => ({
  defaultCloudProviders: () => [],
  mergeCloudProviderPresets: (saved: unknown) => saved,
}));
vi.mock("@/lib/connectivity/provider-connectivity", () => ({
  isProviderAllowedForConnectivity: () => true,
}));

const { useSettingsStore } = await import("@/stores/settings-store");
const { DEFAULT_PERMISSIONS_STATE } = await import("@/stores/slices/permissions-slice");

describe("permission settings", () => {
  beforeEach(() => {
    values.clear();
    useSettingsStore.setState({ ...DEFAULT_PERMISSIONS_STATE });
  });

  it("defaults to Ask with Bash protected", () => {
    expect(useSettingsStore.getState().permissionMode).toBe("ask");
    expect(useSettingsStore.getState().protectedToolIds).toEqual(["bash"]);
    expect(useSettingsStore.getState().autoReviewProviderId).toBe("");
  });

  it("rejects an unknown mode instead of widening access", () => {
    useSettingsStore.getState().setPermissionMode("everything" as never);
    expect(useSettingsStore.getState().permissionMode).toBe("ask");
  });

  it("stores a reviewer independently of the chat provider", () => {
    useSettingsStore.getState().setAutoReviewReviewer(" lm-studio ", " reviewer ");
    expect(useSettingsStore.getState().autoReviewProviderId).toBe("lm-studio");
    expect(useSettingsStore.getState().autoReviewModelId).toBe("reviewer");
  });

  it("keeps the protected list unique and order-stable", () => {
    useSettingsStore.getState().setProtectedToolIds(["bash", "bash", "write", ""]);
    expect(useSettingsStore.getState().protectedToolIds).toEqual(["bash", "write"]);
  });

  it("can turn protection off entirely", () => {
    useSettingsStore.getState().setProtectedToolIds([]);
    expect(useSettingsStore.getState().protectedToolIds).toEqual([]);
  });
});
