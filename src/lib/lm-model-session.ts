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

async function unloadDirect(instanceId: string): Promise<void> {
  const id = instanceId.trim();
  if (!id) return;
  const result = await unloadLmStudioModelDirect(id);
  if (!result.success) throw new Error(result.message);
  loadedModelId = null;
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
): Promise<void> {
  return runLmStudioExclusive(async () => {
    if (signal?.aborted) return;
    const next = modelId.trim();
    if (!next) return;

    const actualLoadedInstances = await fetchActualLoadedModelInstances();
    const actualTargetLoaded = actualLoadedInstances.some((instance) =>
      sameLmStudioModel(instance.modelId, next),
    );
    const instancesToUnload = actualLoadedInstances.length > 0
      ? actualLoadedInstances.filter((instance) => !sameLmStudioModel(instance.modelId, next))
      : loadedModelId && !sameLmStudioModel(loadedModelId, next)
        ? [{ modelId: loadedModelId, instanceId: loadedModelId }]
        : [];

    if (instancesToUnload.length === 0 && actualTargetLoaded) {
      loadedModelId = next;
      return;
    }

    if (instancesToUnload.length === 0 && sameLmStudioModel(loadedModelId ?? "", next)) return;

    for (const loadedInstance of instancesToUnload) {
      await unloadDirect(loadedInstance.instanceId);
    }

    if (actualTargetLoaded) {
      loadedModelId = next;
      return;
    }

    await loadDirect(next);
  });
}

/** Before user chat: load the selected chat model if needed. */
export async function prepareUserChatModel(
  chatModel: string,
  signal?: AbortSignal,
): Promise<void> {
  await ensureLmStudioModel(chatModel, signal);
}

export type PostChatPipelineOptions = {
  chatModel: string;
  titleModel: string;
  summaryModel: string;
  willTitle: boolean;
  willSummarize: boolean;
  willExtractMemory?: boolean;
  signal?: AbortSignal;
  runTitle: () => Promise<void>;
  runSummary: () => Promise<void>;
  runMemoryExtraction?: () => Promise<void>;
};

/** Sequential background pipeline with exactly one resident model at a time. */
export async function runPostChatModelPipeline(
  options: PostChatPipelineOptions,
): Promise<void> {
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

  if (willTitle) await runWithLmStudioModel(titleModel, runTitle, signal);

  if (willSummarize) await runWithLmStudioModel(summaryModel, runSummary, signal);

  if (willExtractMemory && runMemoryExtraction) {
    await runWithLmStudioModel(summaryModel, runMemoryExtraction, signal);
  }

  if (!signal?.aborted) {
    await ensureLmStudioModel(chatModel, signal);
  }
}

async function runWithLmStudioModel(
  modelId: string,
  run: () => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;
  await ensureLmStudioModel(modelId, signal);
  if (!signal?.aborted) await run();
}
