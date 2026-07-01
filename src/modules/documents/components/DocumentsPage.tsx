import { useEffect, useRef, useState, startTransition } from "react";
import { FileText, Eye, Columns2, Code } from "lucide-react";
import { useDocumentStore } from "../document-store";
import type { ViewMode } from "../document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { DocumentListPanel } from "./document-list-panel";
import { DocEditorHeader } from "./doc-editor-header";
import { DocumentToolbar } from "./document-toolbar";
import { SplitEditor } from "./split-editor";
import { DocumentVersionList } from "./document-version-list";
import { AiAssistPanel } from "./ai-assist-panel";
import { cn } from "@/lib/utils";

const VIEW_MODES: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
  { mode: "source", icon: <Code className="size-3.5" />, label: "Source" },
  { mode: "split", icon: <Columns2 className="size-3.5" />, label: "Split" },
  { mode: "preview", icon: <Eye className="size-3.5" />, label: "Preview" },
];

export function DocumentsPage() {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const viewMode = useDocumentStore((s) => s.viewMode);
  const setViewMode = useDocumentStore((s) => s.setViewMode);
  const loadAllDocuments = useDocumentStore((s) => s.loadAllDocuments);
  const setDocumentsTabActive = useDocumentStore((s) => s.setDocumentsTabActive);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const prevDocIdRef = useRef<string | null>(null);

  useEffect(() => {
    setDocumentsTabActive(true);
    void loadAllDocuments();
    return () => setDocumentsTabActive(false);
  }, [loadAllDocuments, setDocumentsTabActive]);

  useEffect(() => {
    if (!activeDocumentId) return;
    const settings = useSettingsStore.getState();
    if (activeDocumentId !== prevDocIdRef.current) {
      prevDocIdRef.current = activeDocumentId;
      startTransition(() => {
        if (settings.documentDefaultViewMode !== viewMode) {
          setViewMode(settings.documentDefaultViewMode);
        }
        if (settings.documentAiPanelAutoShow) {
          setAiPanelOpen(true);
        }
      });
    }
  }, [activeDocumentId, viewMode, setViewMode]);

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <DocumentListPanel />
      <div className="flex min-w-0 flex-1 flex-col">
        {activeDocumentId ? (
          <>
            <DocEditorHeader />
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-2 py-1">
              <DocumentToolbar />
              <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-[var(--color-border)] bg-white/[0.02] p-0.5">
                {VIEW_MODES.map((v) => (
                  <button
                    key={v.mode}
                    type="button"
                    title={v.label}
                    onClick={() => setViewMode(v.mode)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                      viewMode === v.mode
                        ? "bg-[var(--color-accent-soft)] text-white"
                        : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
                    )}
                  >
                    {v.icon}
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <SplitEditor onOpenAiPanel={() => setAiPanelOpen(true)} />
                <DocumentVersionList />
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 text-[var(--color-text-dim)]">
            <div className="grid size-16 place-items-center rounded-2xl bg-white/[0.03]">
              <FileText className="size-8 opacity-40" />
            </div>
            <div className="text-center">
              <p className="text-[14px] font-medium text-[var(--color-text)]">
                No document selected
              </p>
              <p className="mt-1 text-[13px]">
                Select a document from the list or create a new one.
              </p>
            </div>
          </div>
        )}
      </div>
      {aiPanelOpen && activeDocumentId && (
        <AiAssistPanel
          key={activeDocumentId}
          onClose={() => setAiPanelOpen(false)}
        />
      )}
    </div>
  );
}
