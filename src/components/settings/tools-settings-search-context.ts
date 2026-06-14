import { createContext, useContext } from "react";

export const ToolsSettingsSearchContext = createContext("");

export function useToolsSettingsSearch(): string {
  return useContext(ToolsSettingsSearchContext);
}
