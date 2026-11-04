import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import {
  refreshPiModelCatalog,
  inspectModelReasoning,
  invalidateReasoningCache,
  chatModelReasoning,
  effectiveReasoningLevel,
  fallbackModelReasoning,
  normalizeReasoningLevels,
  reasoningModelKey,
} from "@/lib/reasoning-capabilities";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("reasoning capability helpers", () => {
  it("retries failed capability lookups instead of caching unavailable options", async () => {
    invalidateReasoningCache();
    const mockedInvoke = vi.mocked(invoke);
    mockedInvoke.mockResolvedValueOnce({ known: false, levels: [], message: "Unavailable" })
      .mockResolvedValueOnce({ known: true, levels: ["off", "medium"], control: "toggle", message: "" });
    expect((await inspectModelReasoning("test", "retry-model")).known).toBe(false);
    expect(await inspectModelReasoning("test", "retry-model")).toMatchObject({ known: true, levels: ["off", "medium"] });
    await inspectModelReasoning("test", "retry-model");
    expect(mockedInvoke).toHaveBeenCalledTimes(2);
    mockedInvoke.mockReset();
    invalidateReasoningCache();
  });
  it("keeps supported levels and normalizes them into Pi's canonical order", () => {
    expect(normalizeReasoningLevels(["high", "off", "medium"])).toEqual([
      "off",
      "medium",
      "high",
    ]);
    expect(normalizeReasoningLevels(["bogus", "low"])).toEqual(["low"]);
    expect(normalizeReasoningLevels(undefined)).toEqual([]);
  });

  it("clamps upward first, then downward, matching Pi", () => {
    expect(effectiveReasoningLevel("low", ["off", "medium", "high"])).toBe("medium");
    expect(effectiveReasoningLevel("max", ["off", "low"])).toBe("low");
    expect(effectiveReasoningLevel("off", ["low", "high"])).toBe("low");
    expect(effectiveReasoningLevel("high", ["off", "low", "medium", "high"])).toBe("high");
  });

  it("falls back to off when the model advertises no levels", () => {
    expect(effectiveReasoningLevel("medium", [])).toBe("off");
    expect(effectiveReasoningLevel("medium", null as unknown as [])).toBe("off");
  });

  it("uses the same model key for equivalent endpoint spellings", () => {
    expect(reasoningModelKey("openai", "gpt-5", "https://api.example.com/v1/")).toBe(
      reasoningModelKey("openai", "gpt-5", "https://api.example.com/v1"),
    );
    expect(reasoningModelKey("openai", "gpt-5", "https://api.example.com/v1")).not.toBe(
      reasoningModelKey("openai", "gpt-5", "https://other.example.com/v1"),
    );
  });

  it("offers basic off/low/high levels when Pi cannot be read", () => {
    const fallback = fallbackModelReasoning();
    expect(fallback.known).toBe(false);
    expect(fallback.levels).toEqual(["off", "low", "high"]);
    expect(fallback.control).toBe("effort");
  });
});

it("uses NVIDIA MiniMax M3.1 Flash's documented effort levels", () => {
  const managed = { known: true, control: "none" as const, levels: [], message: "Managed" };
  const result = chatModelReasoning(managed, "minimaxai/minimax-m3.1-flash", "https://integrate.api.nvidia.com/v1");
  expect(result.levels).toEqual(["low", "medium", "high", "xhigh", "max"]);
  expect(result.control).toBe("effort");
  expect(result.message).not.toContain("managed");
  expect(chatModelReasoning(managed, "other", "https://integrate.api.nvidia.com/v1")).toBe(managed);
  expect(chatModelReasoning(managed, "minimaxai/minimax-m3.1-flash", "https://example.com/v1")).toBe(managed);
});
it("exposes NVIDIA Nemotron's documented toggle when Pi reports managed", () => {
  const managed = { known: true, control: "none" as const, levels: [], message: "Managed" };
  expect(chatModelReasoning(managed, "nvidia/nemotron-3.5-super-vl-120b-a12b", "https://integrate.api.nvidia.com/v1"))
    .toMatchObject({ control: "toggle", levels: ["off", "medium"] });
  expect(chatModelReasoning(managed, "nvidia/nemotron-3.5-super-vl-120b-a12b", "https://example.com/v1")).toBe(managed);
});

it("refreshes the Pi catalog only once per launch", async () => {
  const mockedInvoke = vi.mocked(invoke);
  mockedInvoke.mockResolvedValueOnce({ known: true, levels: [], message: "" });
  await Promise.all([refreshPiModelCatalog(), refreshPiModelCatalog()]);
  await refreshPiModelCatalog();
  expect(mockedInvoke).toHaveBeenCalledTimes(1);
  expect(mockedInvoke).toHaveBeenCalledWith("refresh_agent_models");
  mockedInvoke.mockReset();
});
