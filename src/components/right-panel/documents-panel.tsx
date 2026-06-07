import { useState, useCallback } from "react";
import { Bookmark, ChevronDown, ChevronRight, FileText, Globe, Settings2, Trash2 } from "lucide-react";
import { PanelShell } from "@/components/right-panel";
import { useDocumentStore } from "@/modules/documents/document-store";
import { formatDocumentType } from "@/modules/documents/document-export";
import { useSettingsStore } from "@/stores/settings-store";
import { useMemoryStore } from "@/stores/memory-store";
import { SettingToggle } from "@/components/right-panel/tools-panel";
import { SliderControl } from "@/components/ui/slider-control";

export function DocumentsPanel() {
  const documentPanelEnabled = useSettingsStore((s) => s.documentPanelEnabled);
  const documents = useDocumentStore((s) => s.documents);
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const openDocument = useDocumentStore((s) => s.openDocument);
  const deleteDocument = useDocumentStore((s) => s.deleteDocument);
  const createMemoryNode = useMemoryStore((s) => s.createNode);

  const handleDelete = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (window.confirm("Delete this document?")) {
        void deleteDocument(id);
      }
    },
    [deleteDocument],
  );

  const handleSaveToMemories = useCallback(
    (e: React.MouseEvent, doc: (typeof documents)[number]) => {
      e.stopPropagation();
      void createMemoryNode({
        folderId: "default",
        conversationId: doc.conversationId,
        projectId: doc.projectId,
        title: doc.title,
        content: doc.contentMarkdown,
        summary: doc.contentMarkdown.length > 180 ? `${doc.contentMarkdown.slice(0, 177)}…` : doc.contentMarkdown,
        type: "file_reference",
        scope: doc.isGlobal ? "global" : "conversation",
        tags: ["document", doc.type],
        importance: 4,
        confidence: 1,
        priority: "high",
        origin: "explicit_user_save",
        status: "active",
        isPinned: true,
      });
    },
    [createMemoryNode],
  );

  if (!documentPanelEnabled) return null;

  if (documents.length === 0) {
    return (
      <PanelShell title="Documents">
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-3 text-center">
          <p className="text-[11px] text-[var(--color-text-dim)]">
            No documents yet
          </p>
          <p className="mt-1 text-[10px] text-[var(--color-text-dim)]/70">
            Ask the AI to create one
          </p>
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Documents">
      <div className="space-y-1">
        {documents.slice(0, 10).map((doc) => {
          const isActive = doc.id === activeDocumentId;

          return (
            <div
              key={doc.id}
              className={`group/doc flex items-center gap-1 rounded-md transition-colors ${
                isActive
                  ? "bg-indigo-500/10 ring-1 ring-inset ring-indigo-500/20"
                  : "hover:bg-white/[0.04]"
              }`}
            >
              <button
                type="button"
                onClick={() => void openDocument(doc.id)}
                className={`flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-[12px] transition-colors ${
                  isActive ? "text-indigo-300" : "text-[var(--color-text)]"
                }`}
              >
                <FileText className="size-3.5 shrink-0 text-[var(--color-text-dim)]" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1">
                    <p className="truncate font-medium">{doc.title}</p>
                    {doc.isGlobal && (
                      <Globe className="size-3 shrink-0 text-amber-400" />
                    )}
                  </div>
                  <p className="truncate text-[10px] text-[var(--color-text-dim)]">
                    {formatDocumentType(doc.type)}
                  </p>
                </div>
              </button>

              <div className="flex shrink-0 items-center gap-0.5 pr-1.5 opacity-35 transition-opacity group-hover/doc:opacity-100 group-focus-within/doc:opacity-100">
                <button
                  type="button"
                  title="Save to memories"
                  aria-label={`Save "${doc.title}" to memories`}
                  onClick={(e) => handleSaveToMemories(e, doc)}
                  className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] transition-colors hover:bg-amber-400/10 hover:text-amber-300"
                >
                  <Bookmark className="size-3.5" />
                </button>
                <button
                  type="button"
                  title="Delete document"
                  aria-label={`Delete "${doc.title}"`}
                  onClick={(e) => handleDelete(e, doc.id)}
                  className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] transition-colors hover:bg-red-400/10 hover:text-red-300"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        {documents.length > 10 && (
          <p className="px-2.5 pt-1 text-[10px] text-[var(--color-text-dim)]">
            +{documents.length - 10} more
          </p>
        )}
      </div>
    </PanelShell>
  );
}

export function DocumentSettingsPanel() {
  const [expanded, setExpanded] = useState(false);
  const documentPanelEnabled = useSettingsStore((s) => s.documentPanelEnabled);

  const documentAutoSaveEnabled = useSettingsStore((s) => s.documentAutoSaveEnabled);
  const setDocumentAutoSaveEnabled = useSettingsStore((s) => s.setDocumentAutoSaveEnabled);
  const documentAutoSaveDelay = useSettingsStore((s) => s.documentAutoSaveDelay);
  const setDocumentAutoSaveDelay = useSettingsStore((s) => s.setDocumentAutoSaveDelay);
  const documentDefaultType = useSettingsStore((s) => s.documentDefaultType);
  const setDocumentDefaultType = useSettingsStore((s) => s.setDocumentDefaultType);
  const documentWordWrap = useSettingsStore((s) => s.documentWordWrap);
  const setDocumentWordWrap = useSettingsStore((s) => s.setDocumentWordWrap);
  const documentFontSize = useSettingsStore((s) => s.documentFontSize);
  const setDocumentFontSize = useSettingsStore((s) => s.setDocumentFontSize);
  const documentTabSize = useSettingsStore((s) => s.documentTabSize);
  const setDocumentTabSize = useSettingsStore((s) => s.setDocumentTabSize);
  const documentSpellCheck = useSettingsStore((s) => s.documentSpellCheck);
  const setDocumentSpellCheck = useSettingsStore((s) => s.setDocumentSpellCheck);
  const documentAutoOpenOnCreate = useSettingsStore((s) => s.documentAutoOpenOnCreate);
  const setDocumentAutoOpenOnCreate = useSettingsStore((s) => s.setDocumentAutoOpenOnCreate);

  if (!documentPanelEnabled) return null;

  return (
    <PanelShell
      title="Editor Settings"
      action={
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-[var(--color-text-dim)] hover:text-white"
          aria-label={expanded ? "Collapse editor settings" : "Expand editor settings"}
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
      }
    >
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-[11px] text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
        >
          <Settings2 className="size-3.5" />
          <span>Configure editor behavior</span>
        </button>
      ) : (
        <div className="space-y-3">
          <SettingToggle
            label="Auto-save"
            description="Automatically save while editing"
            on={documentAutoSaveEnabled}
            onChange={setDocumentAutoSaveEnabled}
          />

          {documentAutoSaveEnabled && (
            <SliderControl
              variant="compact"
              label="Save delay"
              value={documentAutoSaveDelay}
              min={200}
              max={3000}
              step={100}
              formatValue={(v) => `${v}ms`}
              onChange={setDocumentAutoSaveDelay}
            />
          )}

          <SettingToggle
            label="Auto-open"
            description="Open panel when AI creates a doc"
            on={documentAutoOpenOnCreate}
            onChange={setDocumentAutoOpenOnCreate}
          />

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[var(--color-text)]">
              Default type
            </label>
            <select
              value={documentDefaultType}
              onChange={(e) => setDocumentDefaultType(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[11px] text-[var(--color-text)] outline-none focus:border-indigo-500/50"
            >
              <option value="document">Document</option>
              <option value="technical_spec">Technical Spec</option>
              <option value="essay">Essay</option>
              <option value="report">Report</option>
              <option value="proposal">Proposal</option>
              <option value="readme">README</option>
              <option value="notes">Notes</option>
              <option value="prompt">Prompt</option>
              <option value="project_plan">Project Plan</option>
              <option value="meeting_notes">Meeting Notes</option>
              <option value="research_brief">Research Brief</option>
              <option value="agent_instruction">Agent Instruction</option>
            </select>
          </div>

          <SliderControl
            variant="compact"
            label="Font size"
            value={documentFontSize}
            min={10}
            max={22}
            step={1}
            formatValue={(v) => `${v}px`}
            onChange={setDocumentFontSize}
          />

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[var(--color-text)]">
              Tab size
            </label>
            <div className="flex gap-1">
              {[2, 4, 8].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setDocumentTabSize(size)}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    documentTabSize === size
                      ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-inset ring-indigo-500/30"
                      : "text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <SettingToggle
            label="Word wrap"
            description="Wrap long lines in the editor"
            on={documentWordWrap}
            onChange={setDocumentWordWrap}
          />

          <SettingToggle
            label="Spell check"
            description="Browser spell check in editor"
            on={documentSpellCheck}
            onChange={setDocumentSpellCheck}
          />
        </div>
      )}
    </PanelShell>
  );
}
