import { invoke } from "@tauri-apps/api/core";

export type CloudProviderPreset =
  | "openai"
  | "openrouter"
  | "nvidia-nim"
  | "opencode-zen"
  | "opencode-go"
  | "groq"
  | "custom";

export type CloudProviderConfig = {
  id: string;
  preset: CloudProviderPreset;
  name: string;
  baseUrl: string;
  manualModels: string[];
  hasCredential: boolean;
};

export const CLOUD_PROVIDER_PRESETS: Record<Exclude<CloudProviderPreset, "custom">, Omit<CloudProviderConfig, "manualModels" | "hasCredential">> = {
  openai: { id: "openai", preset: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  openrouter: { id: "openrouter", preset: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  "nvidia-nim": { id: "nvidia-nim", preset: "nvidia-nim", name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1" },
  "opencode-zen": { id: "opencode-zen", preset: "opencode-zen", name: "OpenCode Zen", baseUrl: "https://opencode.ai/zen/v1" },
  // Go is served from its own gateway; `/models` and `/chat/completions` share this root.
  "opencode-go": { id: "opencode-go", preset: "opencode-go", name: "OpenCode Go", baseUrl: "https://opencode.ai/inference/go/v1" },
  groq: { id: "groq", preset: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
};

export function defaultCloudProviders(): CloudProviderConfig[] {
  return Object.values(CLOUD_PROVIDER_PRESETS).map((preset) => ({
    ...preset,
    manualModels: [],
    hasCredential: false,
  }));
}

/**
 * Adds presets that shipped after a configuration was saved, leaving every
 * saved provider untouched. Presets cannot be deleted, so nothing is revived.
 */
export function mergeCloudProviderPresets(saved: CloudProviderConfig[]): CloudProviderConfig[] {
  const present = new Set(saved.map((provider) => provider.preset));
  const missing = defaultCloudProviders().filter((preset) => !present.has(preset.preset));
  return missing.length ? [...saved, ...missing] : saved;
}

export async function saveCloudCredential(providerId: string, apiKey: string): Promise<void> {
  await invoke("save_provider_credential", { providerId, apiKey });
}

export async function deleteCloudCredential(providerId: string): Promise<void> {
  await invoke("delete_provider_credential", { providerId });
}

export async function loadCloudCredential(providerId: string): Promise<string> {
  return invoke<string>("load_provider_credential", { providerId });
}

