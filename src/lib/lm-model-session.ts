import {
  fetchLoadedLmStudioModelInstancesDirect,
  loadLmStudioModelDirect,
  unloadLmStudioModelDirect,
  type LoadedLmStudioModelInstance,
} from "@/lib/lm-studio";
import { runLmStudioExclusive } from "@/lib/lm-studio-session";
import { useSettingsStore } from "@/stores/settings-store";

let loadedModelId: string | null = null;
let loadedContextLength: number | null = null;

export function normalizeLmStudioModelId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return "";
  const atIndex = trimmed.indexOf("@");
  return atIndex >= 0 ? trimmed.slice(0, atIndex) : trimmed;
}

export function sameLmStudioModel(a: string, b: string): boolean {
  const left = normalizeLmStudioModelId(a);
  const right = normalizeLmStudioModelId(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const leftTail = left.includes("/") ? left.split("/").pop() ?? left : left;
  const rightTail = right.includes("/") ? right.split("/").pop() ?? right : right;
  return leftTail.length > 0 && leftTail === rightTail;
}

function contextLengthFor(modelId: string): number {
  return useSettingsStore.getState().getModelSettings(modelId).contextLength;
}

async function loadDirect(modelId: string): Promise<void> {
  const id = modelId.trim();
  if (!id) return;
  const ctxLen = contextLengthFor(id);
  const result = await loadLmStudioModelDirect(id, { contextLength: ctxLen });
  if (!result.success) throw new Error(result.message);
  loadedModelId = id;
  loadedContextLength = ctxLen;
}

async function loadDirectWithContext(modelId: string, contextLength: number): Promise<void> {
  const id = modelId.trim();
  if (!id) return;
  const result = await loadLmStudioModelDirect(id, { contextLength });
  if (!result.success) throw new Error(result.message);
  loadedModelId = id;
  loadedContextLength = contextLength;
}

async function unloadDirect(instanceId: string): Promise<void> {
  const id = instanceId.trim();
  if (!id) return;
  const result = await unloadLmStudioModelDirect(id);
  if (!result.success) throw new Error(result.message);
  loadedModelId = null;
  loadedContextLength = null;
}

/** Unload every model instance Veyra (or LM Studio) has in memory. */
export async function unloadAllLmStudioModels(): Promise<void> {
  return runLmStudioExclusive(async () => {
    const instances = await fetchActualLoadedModelInstances();
    for (const instance of instances) {
      try {
        await unloadDirect(instance.instanceId);
      } catch (err) {
        console.warn(
          "[LM Studio] Unload failed on shutdown:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    loadedModelId = null;
    loadedContextLength = null;
  });
}

async function fetchActualLoadedModelInstances(): Promise<LoadedLmStudioModelInstance[]> {
  try {
    return await fetchLoadedLmStudioModelInstancesDirect();
  } catch {
    return [];
  }
}

/** Ensure the given model is the only one loaded in LM Studio. */
export async function ensureLmStudioModel(
  modelId: string,
  signal?: AbortSignal,
  onProgress?: (phase: string, percent?: number) => void,
  options?: { forceReload?: boolean; contextLength?: number },
): Promise<void> {
  return runLmStudioExclusive(async () => {
    if (signal?.aborted) return;
    const next = modelId.trim();
    if (!next) return;

    let actualLoadedInstances = await fetchActualLoadedModelInstances();
    const targetInstances = actualLoadedInstances.filter((instance) =>
      sameLmStudioModel(instance.modelId, next),
    );

    // When forceReload is requested with a specific context length, check if the
    // model is already loaded with the same context length — skip the expensive
    // unload+reload cycle if nothing changed.
    const contextMatches =
      options?.forceReload &&
      options?.contextLength != null &&
      loadedModelId != null &&
      sameLmStudioModel(loadedModelId, next) &&
      loadedContextLength === options.contextLength;

    if (contextMatches) {
      onProgress?.("ready");
      return;
    }

    const soleTargetLoaded =
      !options?.forceReload &&
      targetInstances.length > 0 &&
      actualLoadedInstances.length === targetInstances.length;

    if (soleTargetLoaded) {
      loadedModelId = next;
      onProgress?.("ready");
      return;
    }

    const unloadInstances = options?.forceReload
      ? targetInstances.length > 0
        ? targetInstances
        : actualLoadedInstances
      : actualLoadedInstances;

    if (unloadInstances.length > 0) {
      onProgress?.("unloading");
      for (const instance of unloadInstances) {
        await unloadDirect(instance.instanceId);
      }
    } else if (
      loadedModelId &&
      (options?.forceReload || !sameLmStudioModel(loadedModelId, next))
    ) {
      onProgress?.("unloading");
      try {
        await unloadDirect(loadedModelId);
      } catch {
        await unloadAllLmStudioModels();
      }
    }

    actualLoadedInstances = await fetchActualLoadedModelInstances();
    const remaining = actualLoadedInstances.filter(
      (instance) => options?.forceReload
        ? sameLmStudioModel(instance.modelId, next)
        : !sameLmStudioModel(instance.modelId, next),
    );
    if (remaining.length > 0) {
      onProgress?.("unloading");
      for (const instance of remaining) {
        await unloadDirect(instance.instanceId);
      }
    }

    const needsLoad = options?.forceReload || targetInstances.length === 0;
    if (needsLoad) {
      onProgress?.("loading");
      if (options?.contextLength != null) {
        await loadDirectWithContext(next, options.contextLength);
      } else {
        await loadDirect(next);
      }
    }

    loadedModelId = next;
    onProgress?.("ready");
  });
}

/** Before user chat: load the selected chat model if needed. */
export async function prepareUserChatModel(
  chatModel: string,
  signal?: AbortSignal,
  onProgress?: (phase: string, percent?: number) => void,
): Promise<void> {
  await ensureLmStudioModel(chatModel, signal, onProgress);
}

/** Before agent chat: force-reload the selected model with agent context length. */
export async function prepareAgentLmStudioModel(
  chatModel: string,
  contextLength: number,
  signal?: AbortSignal,
  onProgress?: (phase: string, percent?: number) => void,
): Promise<void> {
  await ensureLmStudioModel(chatModel, signal, onProgress, {
    forceReload: true,
    contextLength,
  });
}

export type PostChatPipelineOptions = {
  chatModel: string;
  titleModel: string;
  summaryModel: string;
  willTitle: boolean;
  willSummarize: boolean;
  willExtractMemory?: boolean;
  signal?: AbortSignal;
  runTitle: () => Promise<{ prompt?: string; output?: string } | string | void>;
  runSummary: () => Promise<{ prompt?: string; output?: string } | string | void>;
  runMemoryExtraction?: () => Promise<{ prompt?: string; output?: string } | string | void>;
};

/** Sequential background pipeline with exactly one resident model at a time. */
export async function runPostChatModelPipeline(
  options: PostChatPipelineOptions,
): Promise<{ prompt?: string; output?: string } | void> {
  const {
    chatModel,
    titleModel,
    summaryModel,
    willTitle,
    willSummarize,
    willExtractMemory,
    signal,
    runTitle,
    runSummary,
    runMemoryExtraction,
  } = options;

  if (signal?.aborted) return;

  const prompts: string[] = [];
  const outputs: string[] = [];

  if (willTitle) {
    const result = await runWithLmStudioModel(titleModel, runTitle, signal);
    if (result) {
      if (typeof result === "object") {
        if (result.prompt) prompts.push(`[Title]\n${result.prompt}`);
        if (result.output) outputs.push(`Title: ${result.output}`);
      } else {
        outputs.push(`Title: ${result}`);
      }
    }
  }

  if (willSummarize) {
    const result = await runWithLmStudioModel(summaryModel, runSummary, signal);
    if (result) {
      if (typeof result === "object") {
        if (result.prompt) prompts.push(`[Summary]\n${result.prompt}`);
        if (result.output) outputs.push(`Summary: ${result.output.slice(0, 120)}${result.output.length > 120 ? "..." : ""}`);
      } else {
        outputs.push(`Summary: ${result.slice(0, 120)}${result.length > 120 ? "..." : ""}`);
      }
    }
  }

  if (willExtractMemory && runMemoryExtraction) {
    const result = await runWithLmStudioModel(summaryModel, runMemoryExtraction, signal);
    if (result) {
      if (typeof result === "object") {
        if (result.prompt) prompts.push(`[Memory]\n${result.prompt}`);
        if (result.output) outputs.push(result.output);
      } else {
        outputs.push(result);
      }
    }
  }

  if (!signal?.aborted) {
    await ensureLmStudioModel(chatModel, signal);
  }

  const prompt = prompts.length > 0 ? prompts.join("\n\n---\n\n") : undefined;
  const output = outputs.length > 0 ? outputs.join("\n") : undefined;
  return prompt || output ? { prompt, output } : undefined;
}

async function runWithLmStudioModel(
  modelId: string,
  run: () => Promise<{ prompt?: string; output?: string } | string | void>,
  signal?: AbortSignal,
): Promise<{ prompt?: string; output?: string } | string | void> {
  if (signal?.aborted) return;
  await ensureLmStudioModel(modelId, signal);
  if (!signal?.aborted) return run();
}
