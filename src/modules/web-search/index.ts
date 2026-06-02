export type {
  SearchProvider,
  SearchInput,
  SearXNGProviderConfig,
  SearchResult,
  WebSearchInput,
  WebSearchOutput,
  SearchContextBundle,
} from "./types";

export { SearXNGProvider } from "./providers/SearXNGProvider";

export {
  runSearch,
  buildSearchContextBlock,
  WEB_SEARCH_SYSTEM_HINT,
} from "./orchestrator/SearchOrchestrator";

export type {
  TauriSearchResult,
  TauriSearchResponse,
} from "./tauri-commands";

export {
  invokeSearchSearxng,
  invokeTestSearxngConnection,
} from "./tauri-commands";

export type { WebSearchToolCall } from "./tools/webSearchTool";
export { parseWebSearchToolCall } from "./tools/webSearchTool";
