import type { SettingsStoreState } from "@/stores/settings-store";

export interface ToolDefinition {
  id: string;
  name: string;
  enabled: boolean;
  description: string;
  promptContent: string;
}

const WEB_SEARCH_TOOL: ToolDefinition = {
  id: "web-search",
  name: "web.search",
  enabled: false,
  description: "Search the web for current information",
  promptContent: `When the user's question requires current information
you do not have, emit a tool call in this exact JSON format:

{"tool": "web.search", "args": {"query": "your search query here"}}

Do NOT answer from the search results yourself — the app will handle the search and
return results to you. Use web search only when genuinely needed. Do not search for
trivial or timeless questions.`,
};

const ALL_TOOLS: ToolDefinition[] = [WEB_SEARCH_TOOL];

export function getEnabledTools(settings: SettingsStoreState): ToolDefinition[] {
  return ALL_TOOLS.map((tool) => ({
    ...tool,
    enabled: tool.id === "web-search" ? settings.webSearchEnabled : false,
  })).filter((tool) => tool.enabled);
}

export function buildToolsBlock(settings: SettingsStoreState): string {
  const enabled = getEnabledTools(settings);
  if (enabled.length === 0) return "";

  const toolEntries = enabled
    .map(
      (tool) =>
        `<tool name="${tool.name}">\n${tool.promptContent}\n</tool>`,
    )
    .join("\n\n");

  return `<veyra_tools>
Available tools — use only when genuinely needed.

${toolEntries}
</veyra_tools>`;
}
