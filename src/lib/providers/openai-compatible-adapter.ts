import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { inferSupportsImages } from "@/lib/message-attachments";
import { sendOpenAiCompatibleChat } from "@/lib/lm-studio-openai";
import type { ModelInfo } from "@/modules/chat/chat-types";
import type { ProviderAdapter } from "@/lib/providers/types";
import { loadCloudCredential, type CloudProviderConfig } from "@/lib/providers/cloud-config";
import { formatModelDisplayName } from "@/lib/providers/model-display-name";

const ZEN_CHAT_MODELS = new Set([
  "deepseek", "minimax", "glm", "kimi", "grok", "big-pickle", "mimo", "north-mini", "nemotron",
]);

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function validateCloudBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
      return "Use HTTPS. Plain HTTP is allowed only for localhost.";
    }
    if (url.username || url.password) return "Credentials cannot be embedded in the URL.";
    return null;
  } catch {
    return "Enter a valid provider base URL.";
  }
}

function headers(config: CloudProviderConfig, key: string): Record<string, string> {
  const result: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (config.preset === "openrouter") result["X-OpenRouter-Title"] = "Veyra";
  return result;
}

export function isZenChatCompatible(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return [...ZEN_CHAT_MODELS].some((prefix) => normalized.startsWith(prefix));
}

async function credential(config: CloudProviderConfig): Promise<string> {
  const key = await loadCloudCredential(config.id);
  if (!key.trim()) throw new Error(`Add an API key for ${config.name} in Settings.`);
  return key.trim();
}

async function fetchModels(config: CloudProviderConfig): Promise<ModelInfo[]> {
  const key = await credential(config);
  const manual = config.manualModels
    .map((id) => ({ id: id.trim(), name: formatModelDisplayName(id.trim()) }))
    .filter((model) => model.id)
    .filter((model) => config.preset !== "opencode-zen" || isZenChatCompatible(model.id));
  let json: { data?: Array<{ id?: string; name?: string; context_length?: number; architecture?: { input_modalities?: string[] } }> };
  try {
    const response = await tauriFetch(`${normalizeBaseUrl(config.baseUrl)}/models`, {
      headers: headers(config, key),
    });
    if (!response.ok) {
      if (manual.length) return manual;
      throw new Error(`Model discovery failed (${response.status}). Add a model ID manually if this endpoint does not expose /models.`);
    }
    json = await response.json() as typeof json;
  } catch (error) {
    if (manual.length) return manual;
    throw error;
  }
  const discovered: ModelInfo[] = (json.data ?? [])
    .filter((model): model is typeof model & { id: string } => typeof model.id === "string" && Boolean(model.id.trim()))
    .filter((model) => config.preset !== "opencode-zen" || isZenChatCompatible(model.id))
    .map((model) => ({
      id: model.id,
      name: formatModelDisplayName(model.id, model.name),
      contextWindow: model.context_length,
      supportsImages: model.architecture?.input_modalities?.includes("image") ?? inferSupportsImages(model.id),
    }));
  const byId = new Map<string, ModelInfo>(discovered.map((model) => [model.id, model]));
  for (const model of manual) {
    if (!byId.has(model.id)) byId.set(model.id, model);
  }
  return [...byId.values()];
}

export function createOpenAiCompatibleAdapter(config: CloudProviderConfig): ProviderAdapter {
  return {
    id: config.id,
    name: config.name,
    connectivityRequirement: "internet",
    capabilities: { jsonMode: true },
    isAvailable: async () => {
      try { await fetchModels(config); return true; } catch { return false; }
    },
    reconnect: async () => {
      try {
        await fetchModels(config);
        return { success: true };
      } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : `Could not reach ${config.name}.` };
      }
    },
    fetchModels: () => fetchModels(config),
    sendChat: async (options) => {
      try {
        const key = await credential(config);
        await sendOpenAiCompatibleChat({
          ...options,
          baseUrl: normalizeBaseUrl(config.baseUrl),
          headers: headers(config, key),
          omitUnsupportedFields: config.preset === "groq",
          startedAt: Date.now(),
        });
      } catch (error) {
        options.onError(error instanceof Error ? error.message : `Could not send request to ${config.name}.`);
      }
    },
  };
}
