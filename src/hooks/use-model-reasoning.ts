import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useProviderStore } from "@/stores/provider-store";
import {
  REASONING_CHANGED_EVENT,
  fallbackModelReasoning,
  inspectModelReasoning,
  invalidateReasoningCache,
  reasoningModelKey,
  rememberReasoningCapabilities,
  type ModelReasoning,
} from "@/lib/reasoning-capabilities";
import {
  inspectLmStudioReasoning,
  invalidateLmStudioReasoningCache,
} from "@/lib/providers/lm-studio-reasoning";

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
 * Resolves the reasoning levels the selected model actually accepts.
 *
 * Normal chat talks to the provider endpoint directly, so a local LM Studio
 * model's own `/api/v1/models` report is authoritative and takes precedence.
 * Everything else falls back to Pi's model registry, which is also what the Pi
 * agent runtime consumes.
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

    const localEndpoint = providerId === "lm-studio";
    const endpointLookup = localEndpoint
      ? inspectLmStudioReasoning(model, baseUrl, forceRefresh).catch(() => null)
      : Promise.resolve(null);

    const registryLookup = inspectModelReasoning(providerId, model, baseUrl, forceRefresh)
      .catch(() => fallbackModelReasoning());

    Promise.all([endpointLookup, registryLookup])
      .then(([endpoint, registry]) => {
        if (cancelled) return;
        if (!endpoint) {
          setLookup({ key: requestKey, result: registry });
          return;
        }
        // Keep request building in sync with what the endpoint accepts.
        rememberReasoningCapabilities(modelKey, endpoint.control ?? "unknown", endpoint.levels);
        setLookup({ key: requestKey, result: endpoint });
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
      invalidateLmStudioReasoningCache();
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
    invalidateLmStudioReasoningCache();
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
