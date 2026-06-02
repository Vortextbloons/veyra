import {
  loadLmStudioModelDirect,
  unloadLmStudioModelDirect,
} from "@/lib/lm-studio";
import { runLmStudioExclusive } from "@/lib/lm-studio-session";
import { useSettingsStore } from "@/stores/settings-store";

let loadedModelId: string | null = null;

export function sameLmStudioModel(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  return left.length > 0 && left === right;
}

export function getLoadedLmStudioModel(): string | null {
  return loadedModelId;
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

async function unloadDirect(modelId: string): Promise<void> {
  const id = modelId.trim();
  if (!id || loadedModelId !== id) return;
  const result = await unloadLmStudioModelDirect(id);
  if (!result.success) throw new Error(result.message);
  loadedModelId = null;
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
    if (sameLmStudioModel(loadedModelId ?? "", next)) return;

    if (loadedModelId) await unloadDirect(loadedModelId);

    await loadDirect(next);
  });
}

/** Unload whatever model we believe is active. */
export async function releaseLmStudioModel(signal?: AbortSignal): Promise<void> {
  return runLmStudioExclusive(async () => {
    if (signal?.aborted || !loadedModelId) return;
    await unloadDirect(loadedModelId);
  });
}

/** Before user chat: load the selected chat model if needed. */
export async function prepareUserChatModel(
  chatModel: string,
  signal?: AbortSignal,
): Promise<void> {
  await ensureLmStudioModel(chatModel, signal);
}

export type AfterChatHandoffOptions = {
  chatModel: string;
  titleModel: string;
  summaryModel: string;
  willTitle: boolean;
  willSummarize: boolean;
  signal?: AbortSignal;
};

/** Keep the chat model resident after a user turn; the next job switches only if needed. */
export async function afterUserChatHandoff(
  options: AfterChatHandoffOptions,
): Promise<void> {
  if (options.signal?.aborted) return;
}

export type PostChatPipelineOptions = {
  chatModel: string;
  titleModel: string;
  summaryModel: string;
  willTitle: boolean;
  willSummarize: boolean;
  signal?: AbortSignal;
  runTitle: () => Promise<void>;
  runSummary: () => Promise<void>;
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
    signal,
    runTitle,
    runSummary,
  } = options;

  if (signal?.aborted) return;

  if (willTitle) await runWithLmStudioModel(titleModel, runTitle, signal);

  if (willSummarize) await runWithLmStudioModel(summaryModel, runSummary, signal);

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
