import type { ModelInfo } from "@/modules/chat/chat-types";
import type { LmStudioModelEntry, LoadedLmStudioModelInstance } from "@/lib/lm-studio-types";
import { inferSupportsImages } from "@/lib/message-attachments";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const DEFAULT_BASE_URL = "http://localhost:1234";

function modelIdFromEntry(entry: LmStudioModelEntry): string {
  const record = entry as Record<string, unknown>;
  const selectedVariant = record.selected_variant;
  if (typeof selectedVariant === "string" && selectedVariant.trim()) {
    return selectedVariant.trim();
  }
  const value = entry.id ?? entry.key ?? entry.model ?? entry.path;
  return typeof value === "string" ? value.trim() : "";
}

function loadedInstancesFromEntry(entry: LmStudioModelEntry): LoadedLmStudioModelInstance[] {
  if (!Array.isArray(entry.loaded_instances)) return [];
  const modelId = modelIdFromEntry(entry);
  if (!modelId) return [];

  return entry.loaded_instances
    .map((instance) => {
      if (!instance || typeof instance !== "object") return null;
      const value = (instance as Record<string, unknown>).id;
      const instanceId = typeof value === "string" ? value.trim() : "";
      return instanceId ? { modelId, instanceId } : null;
    })
    .filter((instance): instance is LoadedLmStudioModelInstance => Boolean(instance));
}

function isLoadedModelEntry(entry: LmStudioModelEntry): boolean {
  if (entry.loaded === true) return true;
  const state = typeof entry.state === "string" ? entry.state.toLowerCase() : "";
  const status = typeof entry.status === "string" ? entry.status.toLowerCase() : "";
  return state === "loaded" || status === "loaded";
}

function parseModelEntries(json: unknown): LmStudioModelEntry[] {
  if (Array.isArray(json)) return json as LmStudioModelEntry[];
  if (!json || typeof json !== "object") return [];

  const record = json as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data as LmStudioModelEntry[];
  if (Array.isArray(record.models)) return record.models as LmStudioModelEntry[];
  if (Array.isArray(record.loaded)) return record.loaded as LmStudioModelEntry[];
  return [];
}

async function fetchModelEntries(url: string): Promise<LmStudioModelEntry[]> {
  const res = await tauriFetch(url);
  if (!res.ok) return [];
  return parseModelEntries(await res.json());
}

export async function fetchModels(baseUrl?: string): Promise<ModelInfo[]> {
  try {
    const url = `${baseUrl || DEFAULT_BASE_URL}/v1/models`;
    const res = await tauriFetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data ?? []).map((m: { id: string }) => ({
      id: m.id,
      name: m.id,
      supportsImages: inferSupportsImages(m.id),
    }));
  } catch {
    return [];
  }
}

export async function fetchLoadedLmStudioModelInstancesDirect(
  baseUrl?: string,
): Promise<LoadedLmStudioModelInstance[]> {
  const root = baseUrl || DEFAULT_BASE_URL;
  const nativeEntries = await fetchModelEntries(`${root}/api/v1/models`);
  return nativeEntries.flatMap((entry) => {
    const instances = loadedInstancesFromEntry(entry);
    if (instances.length > 0) return instances;
    if (!isLoadedModelEntry(entry)) return [];

    const modelId = modelIdFromEntry(entry);
    return modelId ? [{ modelId, instanceId: modelId }] : [];
  });
}

export async function loadLmStudioModelDirect(
  model: string,
  options?: {
    baseUrl?: string;
    contextLength?: number;
    flashAttention?: boolean;
  },
): Promise<{ success: boolean; message: string }> {
  return loadModelImpl(model, options);
}

async function loadModelImpl(
  model: string,
  options?: {
    baseUrl?: string;
    contextLength?: number;
    flashAttention?: boolean;
  },
): Promise<{ success: boolean; message: string }> {
  try {
    const url = `${options?.baseUrl || DEFAULT_BASE_URL}/api/v1/models/load`;
    const res = await tauriFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        context_length: options?.contextLength,
        flash_attention: options?.flashAttention,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, message: `Load failed (${res.status}): ${text}` };
    }

    const json = await res.json();
    return {
      success: true,
      message: `Model loaded in ${json.load_time_seconds?.toFixed(1)}s`,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to load model",
    };
  }
}

export async function unloadLmStudioModelDirect(
  model: string,
  baseUrl?: string,
): Promise<{ success: boolean; message: string }> {
  return unloadModelImpl(model, baseUrl);
}

async function unloadModelImpl(
  instanceId: string,
  baseUrl?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const url = `${baseUrl || DEFAULT_BASE_URL}/api/v1/models/unload`;
    const res = await tauriFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instance_id: instanceId }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, message: `Unload failed (${res.status}): ${text}` };
    }

    return { success: true, message: "Model unloaded" };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to unload model",
    };
  }
}
