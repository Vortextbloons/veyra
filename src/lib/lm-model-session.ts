import {
  fetchLoadedLmStudioModelInstancesDirect,
  loadLmStudioModelDirect,
  unloadLmStudioModelDirect,
  type LoadedLmStudioModelInstance,
} from "@/lib/lm-studio";
import { runLmStudioExclusive } from "@/lib/lm-studio-session";
import { useSettingsStore } from "@/stores/settings-store";

let loadedModelId: string | null = null;

export function sameLmStudioModel(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  return left.length > 0 && left === right;
}

function contextLengthFor(modelId: string): number {
  return useSettingsStore.getState().getModelSettings(modelId).contextLength;
}

async function loadDirect(modelId: string): Promise<void> {
  const id = modelId.trim();
  if (!id) return;
  const result = await loadLmStudioModelDirect(id, { contextLength: contextLengthFor(id) });
  if (!result.success) throw new Error(result.message);
  loadedModelId = id;
}

async function loadDirectWithContext(modelId: string, contextLength: number): Promise<void> {
  const id = modelId.trim();
  if (!id) return;
  const result = await loadLmStudioModelDirect(id, { contextLength });
  if (!result.success) throw new Error(result.message);
  loadedModelId = id;
}

async function unloadDirect(instanceId: string): Promise<void> {
  const id = instanceId.trim();
  if (!id) return;
  const result = await unloadLmStudioModelDirect(id);
  if (!result.success) throw new Error(result.message);
  loadedModelId = null;
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

    const actualLoadedInstances = await fetchActualLoadedModelInstances();
    const actualTargetLoaded = actualLoadedInstances.some((instance) =>
      sameLmStudioModel(instance.modelId, next),
    );
    const forceReloadTarget = options?.forceReload && actualTargetLoaded;
    const instancesToUnload = actualLoadedInstances.length > 0
      ? actualLoadedInstances.filter((instance) => !sameLmStudioModel(instance.modelId, next))
      : loadedModelId && !sameLmStudioModel(loadedModelId, next)
        ? [{ modelId: loadedModelId, instanceId: loadedModelId }]
        : [];

    if (forceReloadTarget) {
      const targetInstances = actualLoadedInstances.filter((instance) => sameLmStudioModel(instance.modelId, next));
      if (targetInstances.length > 0) onProgress?.("unloading");
      for (const loadedInstance of targetInstances) {
        await unloadDirect(loadedInstance.instanceId);
      }
      onProgress?.("loading");
      await loadDirectWithContext(next, options.contextLength ?? contextLengthFor(next));
      onProgress?.("ready");
      return;
    }

    if (instancesToUnload.length === 0 && actualTargetLoaded) {
      loadedModelId = next;
      onProgress?.("ready");
      return;
    }

    if (instancesToUnload.length === 0 && sameLmStudioModel(loadedModelId ?? "", next)) {
      onProgress?.("ready");
      return;
    }

    if (instancesToUnload.length > 0) {
      onProgress?.("unloading");
    }

    for (const loadedInstance of instancesToUnload) {
      await unloadDirect(loadedInstance.instanceId);
    }

    if (actualTargetLoaded) {
      loadedModelId = next;
      onProgress?.("ready");
      return;
    }

    onProgress?.("loading");
    await loadDirect(next);
    onProgress?.("ready");
  });
}

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

/** Before user chat: load the selected chat model if needed. */
export async function prepareUserChatModel(
  chatModel: string,
  signal?: AbortSignal,
  onProgress?: (phase: string, percent?: number) => void,
): Promise<void> {
  await ensureLmStudioModel(chatModel, signal, onProgress);
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
