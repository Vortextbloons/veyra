import { beforeEach, describe, expect, it, vi } from "vitest";

const setZoom = vi.fn(async (_scale: number) => {});

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ setZoom }),
}));

function createStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  const storage: Storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
  return storage;
}

async function loadUiScale(stored: Record<string, string> = {}) {
  const storage = createStorage(stored);
  vi.stubGlobal("localStorage", storage);
  vi.resetModules();
  const module = await import("@/lib/ui-scale");
  await module.uiScaleReady;
  return { module, storage };
}

describe("ui-scale", () => {
  beforeEach(() => {
    setZoom.mockClear();
  });

  it("applies 100% and persists it on a first run", async () => {
    const { module, storage } = await loadUiScale();

    expect(setZoom).toHaveBeenCalledWith(1);
    expect(module.getUiScale()).toBe(1);
    expect(storage.getItem("veyra.uiScale")).toBe("1");
  });

  it("treats the old implicit 1.1 CSS zoom default as 100%", async () => {
    const { module, storage } = await loadUiScale({ "veyra.zoom": "1.1" });

    expect(setZoom).toHaveBeenCalledWith(1);
    expect(module.getUiScale()).toBe(1);
    expect(storage.getItem("veyra.uiScale")).toBe("1");
  });

  it("keeps an explicit legacy zoom value", async () => {
    const { module } = await loadUiScale({ "veyra.zoom": "0.85" });

    expect(module.getUiScale()).toBe(0.85);
  });

  it("prefers the current storage key", async () => {
    const { module } = await loadUiScale({
      "veyra.uiScale": "1.30",
      "veyra.zoom": "0.8",
    });

    expect(setZoom).toHaveBeenCalledWith(1.3);
    expect(module.getUiScale()).toBe(1.3);
  });

  it("clamps stored values into the supported range", async () => {
    const high = await loadUiScale({ "veyra.uiScale": "4" });
    expect(high.module.getUiScale()).toBe(1.6);

    const low = await loadUiScale({ "veyra.uiScale": "0.2" });
    expect(low.module.getUiScale()).toBe(0.7);
  });

  it("steps, clamps, and resets the scale", async () => {
    const { module } = await loadUiScale();

    await module.zoomUiIn();
    expect(module.getUiScale()).toBe(1.1);

    await module.zoomUiOut();
    await module.zoomUiOut();
    expect(module.getUiScale()).toBe(0.9);

    for (let i = 0; i < 20; i += 1) await module.zoomUiIn();
    expect(module.getUiScale()).toBe(1.6);

    for (let i = 0; i < 20; i += 1) await module.zoomUiOut();
    expect(module.getUiScale()).toBe(0.7);

    await module.resetUiScale();
    expect(module.getUiScale()).toBe(1);
    expect(setZoom).toHaveBeenLastCalledWith(1);
  });
});
