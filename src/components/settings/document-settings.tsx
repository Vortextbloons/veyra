import { useSettingsStore } from "@/stores/settings-store";
import { Toggle } from "@/components/toggle";
import { SliderControl } from "@/components/ui/slider-control";
import { CollapsibleSettingsSection } from "./collapsible-settings-section";
import { DOCUMENT_TYPE_OPTIONS } from "@/modules/documents/document-export";

export function DocumentSettings() {
  const documentPanelEnabled = useSettingsStore((s) => s.documentPanelEnabled);
  const setDocumentPanelEnabled = useSettingsStore((s) => s.setDocumentPanelEnabled);
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
  const documentDefaultViewMode = useSettingsStore((s) => s.documentDefaultViewMode);
  const setDocumentDefaultViewMode = useSettingsStore((s) => s.setDocumentDefaultViewMode);
  const documentAiPanelAutoShow = useSettingsStore((s) => s.documentAiPanelAutoShow);
  const setDocumentAiPanelAutoShow = useSettingsStore((s) => s.setDocumentAiPanelAutoShow);
  const documentListDensity = useSettingsStore((s) => s.documentListDensity);
  const setDocumentListDensity = useSettingsStore((s) => s.setDocumentListDensity);

  return (
    <div className="space-y-8">
      <CollapsibleSettingsSection
        subsectionKey="documents:general"
        title="Documents"
        description="Enable the side document panel and AI document tools."
        keywords={["panel", "enable", "markdown"]}
        defaultExpanded
      >
        <Toggle
          label="Enable document panel"
          on={documentPanelEnabled}
          onChange={setDocumentPanelEnabled}
        />
        <p className="text-[11px] text-[var(--color-text-dim)]">
          The document panel lets you and the AI create, edit, and manage
          markdown documents in a side editor.
        </p>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="mb-2 text-[12.5px] font-medium text-white">
            List density
          </div>
          <p className="mb-2 text-[11px] text-[var(--color-text-dim)]">
            Spacing used in the document list sidebar.
          </p>
          <div className="flex gap-1">
            {(["comfortable", "compact"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDocumentListDensity(d)}
                className={`flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium capitalize transition-colors ${
                  documentListDensity === d
                    ? "bg-[var(--color-accent-soft)] text-white ring-1 ring-inset ring-[var(--color-accent)]/30"
                    : "text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </CollapsibleSettingsSection>

      <CollapsibleSettingsSection
        subsectionKey="documents:behavior"
        title="Behavior"
        description="Auto-save and editor open preferences."
        keywords={["auto-save", "delay", "open", "create"]}
      >
        <Toggle
          label="Auto-save"
          on={documentAutoSaveEnabled}
          onChange={setDocumentAutoSaveEnabled}
        />
        <p className="text-[11px] text-[var(--color-text-dim)]">
          Automatically save documents while editing.
        </p>

        {documentAutoSaveEnabled && (
          <div className="pl-2">
            <SliderControl
              variant="card"
              label="Save delay"
              description="How long to wait after the last keystroke before saving."
              value={documentAutoSaveDelay}
              min={200}
              max={3000}
              step={100}
              formatValue={(v) => `${v}ms`}
              onChange={setDocumentAutoSaveDelay}
            />
          </div>
        )}

        <Toggle
          label="Auto-open on AI create"
          on={documentAutoOpenOnCreate}
          onChange={setDocumentAutoOpenOnCreate}
        />
        <p className="text-[11px] text-[var(--color-text-dim)]">
          Automatically open the editor panel when the AI creates a new
          document.
        </p>

        <Toggle
          label="Auto-open AI assist panel"
          on={documentAiPanelAutoShow}
          onChange={setDocumentAiPanelAutoShow}
        />
        <p className="text-[11px] text-[var(--color-text-dim)]">
          Automatically open the AI assist panel when you open a document.
        </p>
      </CollapsibleSettingsSection>

      <CollapsibleSettingsSection
        subsectionKey="documents:defaults"
        title="Defaults"
        description="Pre-selected values for new documents."
        keywords={["type", "default"]}
      >
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="text-[12.5px] font-medium text-white">
            Default document type
          </div>
          <p className="mb-2 text-[11px] text-[var(--color-text-dim)]">
            Pre-selected type when the AI creates a new document.
          </p>
          <select
            value={documentDefaultType}
            onChange={(e) => setDocumentDefaultType(e.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-[var(--color-accent)]"
          >
            {DOCUMENT_TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="mb-2 text-[12.5px] font-medium text-white">
            Default view mode
          </div>
          <p className="mb-2 text-[11px] text-[var(--color-text-dim)]">
            Reset the editor layout each time you open a document.
          </p>
          <div className="flex gap-1">
            {(["source", "split", "preview"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDocumentDefaultViewMode(mode)}
                className={`flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium capitalize transition-colors ${
                  documentDefaultViewMode === mode
                    ? "bg-[var(--color-accent-soft)] text-white ring-1 ring-inset ring-[var(--color-accent)]/30"
                    : "text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </CollapsibleSettingsSection>

      <CollapsibleSettingsSection
        subsectionKey="documents:editor"
        title="Editor"
        description="Font, tabs, wrap, and spell check."
        keywords={["font", "tab", "wrap", "spell", "size"]}
      >
        <SliderControl
          variant="card"
          label="Font size"
          description="Base font size for the document editor."
          value={documentFontSize}
          min={10}
          max={22}
          step={1}
          formatValue={(v) => `${v}px`}
          onChange={setDocumentFontSize}
        />

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="mb-2 text-[12.5px] font-medium text-white">
            Tab size
          </div>
          <div className="flex gap-1">
            {[2, 4, 8].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setDocumentTabSize(size)}
                className={`flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors ${
                  documentTabSize === size
                    ? "bg-[var(--color-accent-soft)] text-white ring-1 ring-inset ring-[var(--color-accent)]/30"
                    : "text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <Toggle
          label="Word wrap"
          on={documentWordWrap}
          onChange={setDocumentWordWrap}
        />
        <p className="text-[11px] text-[var(--color-text-dim)]">
          Wrap long lines in the editor instead of horizontal scrolling.
        </p>

        <Toggle
          label="Spell check"
          on={documentSpellCheck}
          onChange={setDocumentSpellCheck}
        />
        <p className="text-[11px] text-[var(--color-text-dim)]">
          Enable browser spell checking in the document editor.
        </p>
      </CollapsibleSettingsSection>
    </div>
  );
}
