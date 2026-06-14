import { useMemo } from "react";
import { Search } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import {
  TOOL_SETTINGS_SECTIONS,
  sectionMatchesSearch,
  toolSectionMatchesSearch,
  type ToolSettingsSectionId,
} from "./tools-settings-registry";

type ToolSectionPickerProps = {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
};

export function ToolSectionPicker({
  searchQuery,
  onSearchQueryChange,
}: ToolSectionPickerProps) {
  const visibleSections = useSettingsStore((s) => s.visibleToolSettingsSections);
  const setToolSettingsSectionVisible = useSettingsStore(
    (s) => s.setToolSettingsSectionVisible,
  );
  const setAllToolSettingsSectionsVisible = useSettingsStore(
    (s) => s.setAllToolSettingsSectionsVisible,
  );

  const visibleCount = useMemo(
    () => TOOL_SETTINGS_SECTIONS.filter((s) => visibleSections[s.id]).length,
    [visibleSections],
  );

  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return TOOL_SETTINGS_SECTIONS;
    return TOOL_SETTINGS_SECTIONS.filter((section) =>
      sectionMatchesSearch(searchQuery, [
        section.label,
        section.description,
        ...section.keywords,
      ]),
    );
  }, [searchQuery]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
            Visible sections
          </h2>
          <p className="mt-1 max-w-xl text-[11.5px] text-[var(--color-text-dim)]">
            Choose which tool settings appear below. This only controls what you see
            here — enabling tools in chat is unchanged.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10.5px] font-mono text-[var(--color-text-dim)]">
            {visibleCount}/{TOOL_SETTINGS_SECTIONS.length} visible
          </span>
          <button
            type="button"
            onClick={() => setAllToolSettingsSectionsVisible(true)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-white/[0.06]"
          >
            Show all
          </button>
          <button
            type="button"
            onClick={() => setAllToolSettingsSectionsVisible(false)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            Hide all
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-dim)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Search tool settings…"
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] py-2 pl-8 pr-3 text-[12px] text-white placeholder:text-[var(--color-text-dim)]/50 focus:border-[var(--color-accent)] focus:outline-none"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {filteredCards.map((section) => {
          const Icon = section.icon;
          const on = visibleSections[section.id];
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setToolSettingsSectionVisible(section.id, !on)}
              className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                on
                  ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)]"
                  : "border-[var(--color-border)] bg-[var(--color-panel)] hover:bg-white/[0.02]"
              }`}
            >
              <div
                className={`grid size-8 shrink-0 place-items-center rounded-md ${
                  on
                    ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                    : "bg-[var(--color-bg)] text-[var(--color-text-dim)]"
                }`}
              >
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-white">{section.label}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      on
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-white/5 text-[var(--color-text-dim)]"
                    }`}
                  >
                    {on ? "On" : "Off"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-dim)]">
                  {section.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {searchQuery.trim() && filteredCards.length === 0 && (
        <p className="text-[11.5px] text-[var(--color-text-dim)]">
          No tool sections match &ldquo;{searchQuery}&rdquo;.
        </p>
      )}
    </section>
  );
}

export function isToolSectionVisible(
  id: ToolSettingsSectionId,
  visibleSections: Record<ToolSettingsSectionId, boolean>,
  searchQuery: string,
): boolean {
  if (!visibleSections[id]) return false;
  if (!searchQuery.trim()) return true;
  return toolSectionMatchesSearch(id, searchQuery);
}
