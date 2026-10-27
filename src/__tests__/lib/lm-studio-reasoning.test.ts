import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: fetchMock }));

const {
  inspectLmStudioReasoning,
  invalidateLmStudioReasoningCache,
  rememberLmStudioReasoningOptions,
  lmStudioReasoningValue,
  lmStudioReasoningEffort,
} = await import("@/lib/providers/lm-studio-reasoning");
const { buildV1ChatBody } = await import("@/lib/lm-studio-v1");

function respond(models: unknown[]) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ models }) });
}

function entry(modelId: string, allowed: string[], defaultOption = allowed[allowed.length - 1]) {
  return {
    type: "llm",
    key: modelId.replace(/@.*$/, ""),
    selected_variant: modelId,
    capabilities: { reasoning: { allowed_options: allowed, default: defaultOption } },
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  invalidateLmStudioReasoningCache();
});

describe("LM Studio reasoning capabilities", () => {
  it("reads the model's advertised options instead of reporting managed reasoning", async () => {
    respond([entry("qwen3.5-9b", ["off", "on"], "on")]);
    const result = await inspectLmStudioReasoning("qwen3.5-9b");

    expect(result).toMatchObject({ known: true, control: "toggle", levels: ["off", "medium"] });
    expect(result?.message).toContain("on/off");
  });

  it("keeps effort levels for models that advertise them", async () => {
    respond([entry("reasoner", ["off", "low", "medium", "high"], "medium")]);
    const result = await inspectLmStudioReasoning("reasoner");

    expect(result).toMatchObject({ control: "effort", levels: ["off", "low", "medium", "high"] });
    expect(result?.effectiveLevel).toBe("medium");
  });

  it("returns null when the model publishes no reasoning configuration", async () => {
    respond([{ type: "llm", key: "plain", selected_variant: "plain", capabilities: { vision: false } }]);
    await expect(inspectLmStudioReasoning("plain")).resolves.toBeNull();
  });

  it("returns null when the endpoint is unavailable so Pi can be used", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(inspectLmStudioReasoning("qwen3.5-9b")).resolves.toBeNull();
  });

  it("clamps a requested level to one the model accepts", () => {
    rememberLmStudioReasoningOptions("qwen3.5-9b", ["off", "low", "high"]);
    expect(lmStudioReasoningValue("qwen3.5-9b", "medium")).toBe("high");
    expect(lmStudioReasoningValue("qwen3.5-9b", "max")).toBe("high");
    expect(lmStudioReasoningValue("qwen3.5-9b", "off")).toBe("off");
  });

  it("sends nothing when the model's options are unknown", () => {
    expect(lmStudioReasoningValue("unknown-model", "medium")).toBeUndefined();
    expect(lmStudioReasoningEffort("unknown-model", "off")).toBeUndefined();
  });

  it("maps binary toggle models onto effort vocabulary", () => {
    rememberLmStudioReasoningOptions("qwen3.5-9b", ["off", "on"], "http://localhost:1234");
    expect(lmStudioReasoningEffort("qwen3.5-9b", "off", "http://localhost:1234")).toBe("none");
    expect(lmStudioReasoningEffort("qwen3.5-9b", "high", "http://localhost:1234")).toBe("medium");
  });
});

describe("native chat body reasoning", () => {
  it("carries the resolved reasoning value to LM Studio's endpoint", () => {
    rememberLmStudioReasoningOptions("qwen3.5-9b", ["off", "on"]);
    const body = buildV1ChatBody({
      model: "qwen3.5-9b",
      messages: [{ id: "1", role: "user", content: "hi", timestamp: 0 }],
      reasoning: lmStudioReasoningValue("qwen3.5-9b", "off"),
    });

    expect(body.reasoning).toBe("off");
  });

  it("leaves reasoning unset when no level applies", () => {
    const body = buildV1ChatBody({
      model: "plain-model",
      messages: [{ id: "1", role: "user", content: "hi", timestamp: 0 }],
      reasoning: lmStudioReasoningValue("plain-model", "medium"),
    });

    expect(body).not.toHaveProperty("reasoning");
  });
});
