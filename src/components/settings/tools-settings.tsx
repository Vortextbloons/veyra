import { useMemo, useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { ToolSectionPicker } from "./tool-section-picker";
import { ToolsSettingsSearchProvider } from "./tools-settings-search-provider";
import { TOOL_SETTINGS_SECTIONS, TOOL_SETTINGS_SUBSECTIONS, isToolSectionVisible, useToolSectionHasVisibleSubsections } from "./tools-settings-registry";

function ToolSettingsSectionBlock({
  sectionId,
}: {
  sectionId: (typeof TOOL_SETTINGS_SECTIONS)[number]["id"];
}) {
  const section = TOOL_SETTINGS_SECTIONS.find((s) => s.id === sectionId);
  const hasVisibleSubsections = useToolSectionHasVisibleSubsections(
    TOOL_SETTINGS_SUBSECTIONS[sectionId] ?? [],
  );

  if (!section || !hasVisibleSubsections) return null;

  const Component = section.component;
  const Icon = section.icon;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <div className="grid size-8 place-items-center rounded-lg bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
          <Icon className="size-4" />
        </div>
        <div>
          <h2 className="text-[14px] font-semibold text-white">{section.label}</h2>
          <p className="text-[11.5px] text-[var(--color-text-dim)]">{section.description}</p>
        </div>
      </div>
      <Component />
    </div>
  );
}

export function ToolsSettings() {
  const [searchQuery, setSearchQuery] = useState("");
  const visibleSections = useSettingsStore((s) => s.visibleToolSettingsSections);

  const sectionsToRender = useMemo(
    () =>
      TOOL_SETTINGS_SECTIONS.filter((section) =>
        isToolSectionVisible(section.id, visibleSections, searchQuery),
      ),
    [visibleSections, searchQuery],
  );

  const anyVisible = sectionsToRender.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3">
        <div>
          <h1 className="text-[15px] font-semibold text-white">Tools</h1>
          <p className="mt-1 max-w-2xl text-[12px] text-[var(--color-text-dim)]">
            Configure web search, documents, code execution, and future chat tools.
            Show only the sections you need.
          </p>
        </div>
      </div>

      <ToolSectionPicker searchQuery={searchQuery} onSearchQueryChange={setSearchQuery} />

      <div className="border-t border-[var(--color-border)]" />

      <ToolsSettingsSearchProvider query={searchQuery}>
        {!anyVisible ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
            <p className="text-[13px] font-medium text-white">No tool sections to show</p>
            <p className="max-w-sm text-[12px] text-[var(--color-text-dim)]">
              {searchQuery.trim()
                ? "Try a different search term, or turn a section on above."
                : "Turn on at least one section above to configure tool settings."}
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {sectionsToRender.map((section, index) => (
              <div key={section.id}>
                {index > 0 && (
                  <div className="mb-10 border-t border-[var(--color-border)]" />
                )}
                <ToolSettingsSectionBlock sectionId={section.id} />
              </div>
            ))}
          </div>
        )}
      </ToolsSettingsSearchProvider>
    </div>
  );
}
