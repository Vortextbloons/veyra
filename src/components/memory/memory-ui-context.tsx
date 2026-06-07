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
  selectedFolderId: string | null;
  selectedFileId: string | null;
  selectedNodeId: string | null;
  activeView: MemoryView;
  query: string;
  selectFolder: (id: string | null) => void;
  selectFile: (id: string | null) => void;
  selectNode: (id: string | null) => void;
  setQuery: (query: string) => void;
  setActiveView: (view: MemoryView) => void;
};

const MemoryUiContext = createContext<MemoryUiContextValue | null>(null);

export function MemoryUiProvider({ children }: { children: ReactNode }) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<MemoryView>("all");
  const [query, setQuery] = useState("");

  const value = useMemo<MemoryUiContextValue>(
    () => ({
      selectedFolderId,
      selectedFileId,
      selectedNodeId,
      activeView,
      query,
      selectFolder: setSelectedFolderId,
      selectFile: setSelectedFileId,
      selectNode: setSelectedNodeId,
      setQuery,
      setActiveView,
    }),
    [selectedFolderId, selectedFileId, selectedNodeId, activeView, query],
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
