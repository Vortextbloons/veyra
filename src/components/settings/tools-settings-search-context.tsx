import { createContext, useContext } from "react";

const ToolsSettingsSearchContext = createContext("");

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

export function useToolsSettingsSearch(): string {
  return useContext(ToolsSettingsSearchContext);
}
