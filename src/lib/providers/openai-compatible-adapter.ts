import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { inferSupportsImages } from "@/lib/message-attachments";
import { sendOpenAiCompatibleChat } from "@/lib/lm-studio-openai";
import type { ModelInfo } from "@/modules/chat/chat-types";
import type { ProviderAdapter } from "@/lib/providers/types";
import { loadCloudCredential, type CloudProviderConfig, type CloudProviderPreset } from "@/lib/providers/cloud-config";
import { formatModelDisplayName } from "@/lib/providers/model-display-name";

const ZEN_CHAT_MODELS = new Set([
  "deepseek", "minimax", "glm", "kimi", "grok", "big-pickle", "mimo", "north-mini", "nemotron",
]);

/** OpenCode catalogs advertise each model's native API; the gateway translates the rest. */
const OPENCODE_TEXT_APIS = ["chat-completions", "responses", "messages", "generate-content"];

type CatalogModel = {
  id?: string;
  name?: string;
  /** Legacy OpenAI-compatible field, still returned by several providers. */
  context_length?: number;
  architecture?: { input_modalities?: string[] };
  /** OpenCode catalog metadata. */
  limit?: { context?: number };
  modalities?: { input?: string[] };
  api?: Record<string, unknown>;
};

export function isOpenCodePreset(preset: CloudProviderPreset): boolean {
  return preset === "opencode-zen" || preset === "opencode-go";
}

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

/** One stable session per provider so OpenCode can reuse routing and prompt cache. */
let openCodeSessionId: string | null = null;

function openCodeSession(): string {
  openCodeSessionId ??= `ses_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  return openCodeSessionId;
}

function headers(config: CloudProviderConfig, key: string): Record<string, string> {
  const result: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (config.preset === "openrouter") result["X-OpenRouter-Title"] = "Veyra";
  if (isOpenCodePreset(config.preset)) result["x-opencode-session"] = openCodeSession();
  return result;
}

export function isZenChatCompatible(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return [...ZEN_CHAT_MODELS].some((prefix) => normalized.startsWith(prefix));
}

/**
 * OpenCode serves every text model through Chat Completions by translating the
 * request, so keep each text model and drop utility endpoints such as System One.
 * Catalogs without API metadata fall back to the legacy prefix list.
 */
export function isOpenCodeTextModel(model: CatalogModel): boolean {
  const api = model.api;
  if (!api || typeof api !== "object" || Array.isArray(api)) {
    return isZenChatCompatible(model.id ?? "");
  }
  return OPENCODE_TEXT_APIS.some((name) => name in api);
}

/** Reads the OpenAI-compatible and OpenCode catalog shapes into one model entry. */
export function normalizeCatalogModel(model: CatalogModel): ModelInfo | null {
  const id = typeof model.id === "string" ? model.id.trim() : "";
  if (!id) return null;
  const modalities = model.modalities?.input ?? model.architecture?.input_modalities;
  return {
    id,
    name: formatModelDisplayName(id, model.name),
    contextWindow: model.limit?.context ?? model.context_length,
    supportsImages: modalities?.length
      ? modalities.some((modality) => modality.startsWith("image"))
      : inferSupportsImages(id),
  };
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
    .filter((model) => model.id);
  let json: { data?: CatalogModel[] };
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
    .filter((model) => !isOpenCodePreset(config.preset) || isOpenCodeTextModel(model))
    .map(normalizeCatalogModel)
    .filter((model): model is ModelInfo => model !== null);
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
