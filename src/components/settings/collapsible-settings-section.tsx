import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { sectionMatchesSearch } from "./tools-settings-registry";
import { useToolsSettingsSearch } from "./tools-settings-search-context";

type CollapsibleSettingsSectionProps = {
  subsectionKey: string;
  title: string;
  description?: string;
  keywords?: string[];
  defaultExpanded?: boolean;
  children: React.ReactNode;
};

export function CollapsibleSettingsSection({
  subsectionKey,
  title,
  description,
  keywords = [],
  defaultExpanded = true,
  children,
}: CollapsibleSettingsSectionProps) {
  const searchQuery = useToolsSettingsSearch();
  const expandedMap = useSettingsStore((s) => s.toolSettingsSubsectionsExpanded);
  const setSubsectionExpanded = useSettingsStore((s) => s.setToolSettingsSubsectionExpanded);

  const storedExpanded = expandedMap[subsectionKey];
  const expanded = storedExpanded ?? defaultExpanded;

  const contentId = useId();

  if (!sectionMatchesSearch(searchQuery, [title, description, ...keywords])) {
    return null;
  }

  const toggle = () => {
    setSubsectionExpanded(subsectionKey, !expanded);
  };

  return (
    <section>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls={contentId}
        className="mb-3 flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <ChevronDown
          className={`size-3.5 shrink-0 text-[var(--color-text-dim)] transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-[11px] text-[var(--color-text-dim)]/80">{description}</p>
          )}
        </div>
      </button>
      {expanded && (
        <div id={contentId} className="space-y-3">
          {children}
        </div>
      )}
    </section>
  );
}
