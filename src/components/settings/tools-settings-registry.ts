import type { LucideIcon } from "lucide-react";
import { FileText, Globe } from "lucide-react";
import { WebSearchSettings } from "./web-search-settings";
import { DocumentSettings } from "./document-settings";

export type ToolSettingsSectionId = "webSearch" | "documents";

export type ToolSettingsSection = {
  id: ToolSettingsSectionId;
  label: string;
  description: string;
  icon: LucideIcon;
  keywords: string[];
  component: React.ComponentType;
  defaultVisible?: boolean;
};

export const TOOL_SETTINGS_SECTIONS: ToolSettingsSection[] = [
  {
    id: "webSearch",
    label: "Web Search",
    description: "SearXNG, search defaults, parameters, and page extraction.",
    icon: Globe,
    keywords: [
      "search",
      "searxng",
      "docker",
      "web",
      "fetch",
      "cache",
      "results",
      "safe search",
      "connectivity",
    ],
    component: WebSearchSettings,
    defaultVisible: true,
  },
  {
    id: "documents",
    label: "Documents",
    description: "Document panel, editor behavior, defaults, and formatting.",
    icon: FileText,
    keywords: [
      "document",
      "editor",
      "markdown",
      "auto-save",
      "font",
      "spell",
      "wrap",
      "panel",
    ],
    component: DocumentSettings,
    defaultVisible: true,
  },
];

export const DEFAULT_VISIBLE_TOOL_SETTINGS_SECTIONS: Record<ToolSettingsSectionId, boolean> = {
  webSearch: true,
  documents: true,
};

export const TOOL_SETTINGS_SUBSECTIONS: Record<
  ToolSettingsSectionId,
  Array<{ title: string; description?: string; keywords?: string[] }>
> = {
  webSearch: [
    { title: "SearXNG Server", keywords: ["docker", "container", "searxng"] },
    { title: "Web Search", keywords: ["default", "enable"] },
    { title: "SearXNG Provider", keywords: ["url", "connection", "test"] },
    { title: "Search Mode", keywords: ["auto"] },
    { title: "Search Parameters", keywords: ["results", "time", "category", "safe"] },
    { title: "Content Extraction", keywords: ["fetch", "cache", "readability"] },
  ],
  documents: [
    { title: "Documents", keywords: ["panel", "enable"] },
    { title: "Behavior", keywords: ["auto-save", "open"] },
    { title: "Defaults", keywords: ["type"] },
    { title: "Editor", keywords: ["font", "tab", "wrap", "spell"] },
  ],
};

export function mergeVisibleToolSettingsSections(
  persisted?: Partial<Record<ToolSettingsSectionId, boolean>>,
): Record<ToolSettingsSectionId, boolean> {
  return {
    ...DEFAULT_VISIBLE_TOOL_SETTINGS_SECTIONS,
    ...persisted,
  };
}

export function sectionMatchesSearch(
  query: string,
  terms: Array<string | undefined | null>,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return terms.some((term) => term?.toLowerCase().includes(q));
}

export function toolSectionMatchesSearch(
  sectionId: ToolSettingsSectionId,
  query: string,
): boolean {
  const section = TOOL_SETTINGS_SECTIONS.find((s) => s.id === sectionId);
  if (!section) return false;
  if (
    sectionMatchesSearch(query, [
      section.label,
      section.description,
      ...section.keywords,
    ])
  ) {
    return true;
  }
  return (TOOL_SETTINGS_SUBSECTIONS[sectionId] ?? []).some((sub) =>
    sectionMatchesSearch(query, [sub.title, sub.description, ...(sub.keywords ?? [])]),
  );
}
