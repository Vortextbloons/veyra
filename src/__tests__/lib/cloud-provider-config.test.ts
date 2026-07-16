import { describe, expect, it } from "vitest";
import { CLOUD_PROVIDER_PRESETS, defaultCloudProviders } from "@/lib/providers/cloud-config";
import { isZenChatCompatible, validateCloudBaseUrl } from "@/lib/providers/openai-compatible-adapter";
import { formatModelDisplayName } from "@/lib/providers/model-display-name";
import { configureCloudProviderAdapters, getInitialProviders } from "@/lib/providers";

describe("cloud provider presets", () => {
  it("uses the documented OpenAI-compatible base URLs", () => {
    expect(CLOUD_PROVIDER_PRESETS.openai.baseUrl).toBe("https://api.openai.com/v1");
    expect(CLOUD_PROVIDER_PRESETS.openrouter.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(CLOUD_PROVIDER_PRESETS["nvidia-nim"].baseUrl).toBe("https://integrate.api.nvidia.com/v1");
    expect(CLOUD_PROVIDER_PRESETS["opencode-zen"].baseUrl).toBe("https://opencode.ai/zen/v1");
    expect(CLOUD_PROVIDER_PRESETS.groq.baseUrl).toBe("https://api.groq.com/openai/v1");
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

  it("keeps Responses and Messages models out of the Zen Chat Completions preset", () => {
    expect(isZenChatCompatible("deepseek-v4-flash")).toBe(true);
    expect(isZenChatCompatible("kimi-k2.6")).toBe(true);
    expect(isZenChatCompatible("gpt-5.5")).toBe(false);
    expect(isZenChatCompatible("claude-sonnet-4-6")).toBe(false);
  });

  it("turns namespaced model IDs into readable labels", () => {
    expect(formatModelDisplayName("deepseek-ai/deepseek-v4-0324")).toBe("DeepSeek V4 0324");
    expect(formatModelDisplayName("nvidia/llama-3.3-nemotron-super-49b-v1")).toBe(
      "Llama 3.3 Nemotron Super 49B V1",
    );
    expect(formatModelDisplayName("openai/gpt-oss-120b")).toBe("GPT Oss 120B");
  });
});
