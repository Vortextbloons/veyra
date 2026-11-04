import { describe, expect, it } from "vitest";
import {
  CLOUD_PROVIDER_PRESETS,
  defaultCloudProviders,
  mergeCloudProviderPresets,
} from "@/lib/providers/cloud-config";
import {
  isOpenCodeTextModel,
  isZenChatCompatible,
  normalizeCatalogModel,
  validateCloudBaseUrl,
} from "@/lib/providers/openai-compatible-adapter";
import { formatModelDisplayName } from "@/lib/providers/model-display-name";
import { configureCloudProviderAdapters, getInitialProviders } from "@/lib/providers";

describe("cloud provider presets", () => {
  it("uses the documented OpenAI-compatible base URLs", () => {
    expect(CLOUD_PROVIDER_PRESETS.openai.baseUrl).toBe("https://api.openai.com/v1");
    expect(CLOUD_PROVIDER_PRESETS.openrouter.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(CLOUD_PROVIDER_PRESETS["nvidia-nim"].baseUrl).toBe("https://integrate.api.nvidia.com/v1");
    expect(CLOUD_PROVIDER_PRESETS["opencode-zen"].baseUrl).toBe("https://opencode.ai/zen/v1");
    expect(CLOUD_PROVIDER_PRESETS["opencode-go"].baseUrl).toBe("https://opencode.ai/inference/go/v1");
    expect(CLOUD_PROVIDER_PRESETS.groq.baseUrl).toBe("https://api.groq.com/openai/v1");
  });

  it("keeps saved providers while adding presets introduced later", () => {
    const saved = defaultCloudProviders().filter((provider) => provider.preset !== "opencode-go");
    const merged = mergeCloudProviderPresets(saved);
    expect(merged.map((provider) => provider.preset)).toContain("opencode-go");
    expect(merged.filter((provider) => provider.preset === "opencode-go")).toHaveLength(1);
    expect(mergeCloudProviderPresets(merged)).toEqual(merged);
  });

  it("shows cloud providers in chat only after they are configured", () => {
    const providers = defaultCloudProviders();
    configureCloudProviderAdapters(providers);
    expect(getInitialProviders().map((provider) => provider.id)).toEqual(["lm-studio"]);

    configureCloudProviderAdapters(
      providers.map((provider) => provider.id === "openai" ? { ...provider, hasCredential: true } : provider),
    );
    expect(getInitialProviders().map((provider) => provider.id)).toEqual(["lm-studio", "openai"]);
    configureCloudProviderAdapters(defaultCloudProviders());
  });

  it("requires secure public URLs while permitting localhost development", () => {
    expect(validateCloudBaseUrl("https://example.com/v1")).toBeNull();
    expect(validateCloudBaseUrl("http://localhost:8080/v1")).toBeNull();
    expect(validateCloudBaseUrl("http://example.com/v1")).toMatch(/HTTPS/);
    expect(validateCloudBaseUrl("https://user:secret@example.com/v1")).toMatch(/embedded/);
  });

  it("keeps every OpenCode text model and drops utility-only endpoints", () => {
    expect(isOpenCodeTextModel({ id: "gpt-6-luna", api: { responses: {} } })).toBe(true);
    expect(isOpenCodeTextModel({ id: "claude-haiku-5-5", api: { messages: {} } })).toBe(true);
    expect(isOpenCodeTextModel({ id: "glm-5.3", api: { "chat-completions": {} } })).toBe(true);
    expect(isOpenCodeTextModel({ id: "jev-1.13", api: { systemone: {} } })).toBe(false);
  });

  it("falls back to the legacy prefix list when a catalog has no API metadata", () => {
    expect(isOpenCodeTextModel({ id: "deepseek-v4-flash" })).toBe(true);
    expect(isOpenCodeTextModel({ id: "gpt-5.5" })).toBe(false);
    expect(isZenChatCompatible("kimi-k2.6")).toBe(true);
  });

  it("reads context window and image support from the OpenCode catalog", () => {
    expect(normalizeCatalogModel({
      id: "glm-5.3",
      name: "GLM-5.3",
      limit: { context: 1_000_000 },
      modalities: { input: ["text"] },
    })).toEqual({ id: "glm-5.3", name: "GLM 5.3", contextWindow: 1_000_000, supportsImages: false });

    expect(normalizeCatalogModel({
      id: "kimi-k3",
      name: "Kimi K3",
      limit: { context: 1_048_576 },
      modalities: { input: ["text", "image/png"] },
    })).toEqual({ id: "kimi-k3", name: "Kimi K3", contextWindow: 1_048_576, supportsImages: true });

    expect(normalizeCatalogModel({ id: "  " })).toBeNull();
  });

  it("still reads legacy OpenAI-compatible model metadata", () => {
    expect(normalizeCatalogModel({
      id: "nvidia/llama-3.3-nemotron-super-49b-v1",
      context_length: 131_072,
      architecture: { input_modalities: ["text", "image"] },
    })).toEqual({
      id: "nvidia/llama-3.3-nemotron-super-49b-v1",
      name: "Llama 3.3 Nemotron Super 49B V1",
      contextWindow: 131_072,
      supportsImages: true,
    });
  });

  it("turns namespaced model IDs into readable labels", () => {
    expect(formatModelDisplayName("deepseek-ai/deepseek-v4-0324")).toBe("DeepSeek V4 0324");
    expect(formatModelDisplayName("nvidia/llama-3.3-nemotron-super-49b-v1")).toBe(
      "Llama 3.3 Nemotron Super 49B V1",
    );
    expect(formatModelDisplayName("openai/gpt-oss-120b")).toBe("GPT Oss 120B");
    expect(formatModelDisplayName("minimax-m3")).toBe("MiniMax M3");
    expect(formatModelDisplayName("longcat-2.0")).toBe("LongCat 2.0");
  });
});
