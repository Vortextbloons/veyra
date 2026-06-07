import { useDocumentStore } from "../document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { DocEditorHeader } from "./doc-editor-header";
import { DocumentToolbar } from "./document-toolbar";
import { MarkdownEditor } from "./markdown-editor";
import { DocumentVersionList } from "./document-version-list";

export function DocEditorPanel() {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const documentPanelEnabled = useSettingsStore((s) => s.documentPanelEnabled);

  if (!activeDocumentId || !documentPanelEnabled) return null;

  return (
    <aside className="flex h-full w-[500px] min-w-[400px] max-w-[700px] flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <DocEditorHeader />
      <DocumentToolbar />
      <div className="flex-1 min-h-0 overflow-hidden">
        <MarkdownEditor />
      </div>
      <DocumentVersionList />
    </aside>
  );
}
