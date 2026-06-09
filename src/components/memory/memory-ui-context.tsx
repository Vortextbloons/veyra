import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type MemoryView =
  | "all"
  | "inbox"
  | "pinned"
  | "permanent"
  | "low_priority"
  | "recent"
  | "archived";

type MemoryUiContextValue = {
  selectedNodeId: string | null;
  activeView: MemoryView;
  query: string;
  selectNode: (id: string | null) => void;
  setQuery: (query: string) => void;
  setActiveView: (view: MemoryView) => void;
};

const MemoryUiContext = createContext<MemoryUiContextValue | null>(null);

export function MemoryUiProvider({ children }: { children: ReactNode }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<MemoryView>("all");
  const [query, setQuery] = useState("");

  const value = useMemo<MemoryUiContextValue>(
    () => ({
      selectedNodeId,
      activeView,
      query,
      selectNode: setSelectedNodeId,
      setQuery,
      setActiveView,
    }),
    [selectedNodeId, activeView, query],
  );

  return <MemoryUiContext.Provider value={value}>{children}</MemoryUiContext.Provider>;
}

// Hook is co-located with its provider context.
// eslint-disable-next-line react-refresh/only-export-components
export function useMemoryUi(): MemoryUiContextValue {
  const ctx = useContext(MemoryUiContext);
  if (!ctx) {
    throw new Error("useMemoryUi must be used within MemoryUiProvider");
  }
  return ctx;
}
