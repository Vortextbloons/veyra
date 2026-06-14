import { ToolsSettingsSearchContext } from "./tools-settings-search-context";

export function ToolsSettingsSearchProvider({
  query,
  children,
}: {
  query: string;
  children: React.ReactNode;
}) {
  return (
    <ToolsSettingsSearchContext.Provider value={query}>
      {children}
    </ToolsSettingsSearchContext.Provider>
  );
}
