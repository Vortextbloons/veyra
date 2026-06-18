import type { ProviderToolCall } from "@/lib/providers/types";
import type { WebSearchSource } from "@/modules/chat/chat-types";
import { WEB_SEARCH_TOOL_NAME } from "@/lib/tool-registry";
import { stringArg } from "@/modules/chat/chat-tool-utils";
import {
  runSearch,
  buildSearchContextBlock,
} from "@/modules/web-search/orchestrator/SearchOrchestrator";
import { useChatStore } from "@/stores/chat-store";

const TOOL_RETRY_LIMIT = 2;

type WebSearchCallResult = {
  section: string;
  sources: WebSearchSource[];
  contextBlock: string;
  query: string;
};

type WebSearchCallOptions = {
  signal?: AbortSignal;
  projectId?: string;
  webSearchEnabled: boolean;
  webSearchAvailability: { available: boolean; reason?: string };
};

export async function executeWebSearchCall(
  call: ProviderToolCall,
  attempt: number,
  opts: WebSearchCallOptions,
): Promise<WebSearchCallResult> {
  const chatStore = useChatStore.getState();
  const query = stringArg(call.arguments, "query");
  if (!query) {
    throw new Error("Web search failed: invalid tool arguments.");
  }
  if (!opts.webSearchEnabled) {
    throw new Error(
      opts.webSearchAvailability.reason ?? "Web search is unavailable in Offline mode.",
    );
  }

  useChatStore.getState().upsertStreamingWebSearchRound({
    id: call.id,
    query,
    phase: "searching",
    sources: [],
  });
  chatStore.setStreamingToolState({
    id: call.id,
    name: WEB_SEARCH_TOOL_NAME,
    label: "Web Search",
    phase: attempt > 0 ? "retrying" : "running",
    input: query,
    attempts: attempt > 0 ? attempt : undefined,
  });

  let searchBundle: Awaited<ReturnType<typeof runSearch>> | null = null;
  let lastSearchError: unknown = null;
  for (let retry = 0; retry <= TOOL_RETRY_LIMIT; retry += 1) {
    try {
      if (retry > 0) {
        chatStore.setStreamingToolState({
          id: call.id,
          name: WEB_SEARCH_TOOL_NAME,
          label: "Web Search",
          phase: "retrying",
          input: query,
          attempts: retry,
        });
      }
      useChatStore.getState().upsertStreamingWebSearchRound({
        id: call.id,
        query,
        phase: "searching",
        sources: [],
      });
      searchBundle = await runSearch(query, {
        signal: opts.signal,
        projectId: opts.projectId,
        onFetchProgress: (completed, total) => {
          useChatStore.getState().upsertStreamingWebSearchRound({
            id: call.id,
            query,
            phase: "fetching",
            sources: [],
            fetch_progress: { completed, total },
          });
        },
      });
      lastSearchError = null;
      break;
    } catch (error) {
      lastSearchError = error;
      if (retry >= TOOL_RETRY_LIMIT) throw error;
    }
  }
  if (!searchBundle) throw lastSearchError ?? new Error("Search failed");

  const contextBlock = buildSearchContextBlock(searchBundle);
  const sources: WebSearchSource[] = searchBundle.sources.map((s) => ({
    id: s.id,
    title: s.title,
    url: s.url,
    snippet: s.snippet ?? "",
    ...(s.fetch ? { fetch: s.fetch } : {}),
  }));

  useChatStore.getState().upsertStreamingWebSearchRound({
    id: call.id,
    query,
    phase: "reading",
    sources,
  });
  const fetchedCount = searchBundle.fetchedPages?.length ?? 0;
  const detail =
    fetchedCount > 0
      ? `${sources.length} source${sources.length !== 1 ? "s" : ""} · ${fetchedCount} page${fetchedCount !== 1 ? "s" : ""} read`
      : `${sources.length} source${sources.length !== 1 ? "s" : ""} found`;
  chatStore.setStreamingToolState({
    id: call.id,
    name: WEB_SEARCH_TOOL_NAME,
    label: "Web Search",
    phase: "done",
    input: query,
    detail,
  });

  return {
    section: `Tool result for ${WEB_SEARCH_TOOL_NAME}(${JSON.stringify({ query })}):\n\n${contextBlock}`,
    sources,
    contextBlock,
    query,
  };
}
