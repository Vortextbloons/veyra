import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useProviderStore } from "@/stores/provider-store";
import {
  REASONING_CHANGED_EVENT,
  fallbackModelReasoning,
  inspectModelReasoning,
  invalidateReasoningCache,
  reasoningModelKey,
  type ModelReasoning,
} from "@/lib/reasoning-capabilities";

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type ModelReasoningState = {
  modelKey: string;
  result: ModelReasoning | null;
  checking: boolean;
  refresh: () => void;
};

/**
 * Resolves the reasoning levels Pi advertises for the currently selected
 * model, and refreshes when Pi's models.json changes on disk.
 */
export function useModelReasoning(): ModelReasoningState {
  const providerId = useProviderStore((state) => state.selectedProvider);
  const model = useProviderStore((state) => state.selectedModel);
  const baseUrl = useProviderStore(
    (state) => state.cloudProviders.find((provider) => provider.id === state.selectedProvider)?.baseUrl,
  );
  const modelKey = reasoningModelKey(providerId, model, baseUrl ?? "");

  const [lookup, setLookup] = useState<{ key: string; result: ModelReasoning } | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const previousRefresh = useRef(0);
  const requestKey = `${modelKey}:${refreshToken}`;

  useEffect(() => {
    if (!model) return;
    let cancelled = false;
    const forceRefresh = refreshToken !== previousRefresh.current;
    previousRefresh.current = refreshToken;
    inspectModelReasoning(providerId, model, baseUrl, forceRefresh)
      .then((result) => {
        if (!cancelled) setLookup({ key: requestKey, result });
      })
      .catch(() => {
        if (!cancelled) setLookup({ key: requestKey, result: fallbackModelReasoning() });
      });
    return () => {
      cancelled = true;
    };
  }, [providerId, model, baseUrl, modelKey, refreshToken, requestKey]);

  useEffect(() => {
    if (!hasTauriRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen(REASONING_CHANGED_EVENT, () => {
      invalidateReasoningCache();
      setRefreshToken((token) => token + 1);
    })
      .then((dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const refresh = useCallback(() => {
    invalidateReasoningCache();
    setRefreshToken((token) => token + 1);
  }, []);

  const result = lookup?.key === requestKey ? lookup.result : null;

  return {
    modelKey,
    result,
    checking: Boolean(model) && result === null,
    refresh,
  };
}
