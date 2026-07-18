import type { SearchInput, SearchIntent, SearxCapabilities } from "./types";

const INTENT_CATEGORIES: Record<SearchIntent, string[]> = {
  general: ["general"],
  news: ["news"],
  academic: ["science"],
  code: ["it"],
  documentation: ["it"],
  local: ["map"],
  discussion: ["general", "social media"],
};

const INTENT_ENGINE_HINTS: Record<SearchIntent, string[]> = {
  general: ["wikipedia"],
  news: [],
  academic: ["arxiv", "pubmed", "semantic scholar", "openalex"],
  code: ["github", "stackoverflow"],
  documentation: ["github", "stackoverflow"],
  local: ["openstreetmap"],
  discussion: ["reddit"],
};

function inferIntent(query: string): SearchIntent {
  const text = query.toLowerCase();
  if (/\b(latest|today|breaking|current events?|news)\b/.test(text)) return "news";
  if (/\b(study|paper|research|journal|clinical|arxiv|pubmed)\b/.test(text)) return "academic";
  if (/\b(error|exception|stack trace|typescript|javascript|python|rust|api|sdk|package|library|github)\b/.test(text)) return "code";
  if (/\b(docs?|documentation|reference|manual|changelog|release notes?)\b/.test(text)) return "documentation";
  if (/\b(near me|directions|map|address|restaurant|hotel)\b/.test(text)) return "local";
  if (/\b(reddit|forum|discussion|community|opinions?|experiences?)\b/.test(text)) return "discussion";
  return "general";
}

function availableCategories(capabilities?: SearxCapabilities): Set<string> | undefined {
  if (!capabilities) return undefined;
  return new Set(capabilities.categories.map((category) => category.toLowerCase()));
}

export function resolveSearchRouting(
  input: Pick<SearchInput, "query" | "intent" | "categories" | "engines" | "timeRange">,
  capabilities?: SearxCapabilities,
): Required<Pick<SearchInput, "intent">> & Pick<SearchInput, "categories" | "engines" | "timeRange"> {
  const intent = input.intent ?? inferIntent(input.query);
  const supportedCategories = availableCategories(capabilities);
  const categories = input.categories
    ? input.categories.split(",").map((value) => value.trim()).filter(Boolean)
    : INTENT_CATEGORIES[intent].filter((category) => !supportedCategories || supportedCategories.has(category));

  const enabledEngines = capabilities?.engines.filter((engine) => engine.enabled) ?? [];
  const engineHints = INTENT_ENGINE_HINTS[intent];
  const routedEngines = input.engines
    ? input.engines.split(",").map((value) => value.trim()).filter(Boolean)
    : enabledEngines
        .filter((engine) => engineHints.some((hint) =>
          engine.name.toLowerCase().includes(hint) || engine.shortcut.toLowerCase() === hint))
        .map((engine) => engine.name);

  return {
    intent,
    categories: categories.length > 0 ? categories.join(",") : undefined,
    engines: routedEngines.length > 0 ? routedEngines.join(",") : undefined,
    timeRange: input.timeRange ?? (intent === "news" ? "week" : undefined),
  };
}
