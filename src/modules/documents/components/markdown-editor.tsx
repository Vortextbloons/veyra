import { useCallback, useEffect, useRef, useState } from "react";
import { useDocumentStore } from "../document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { countWords, countCharacters } from "../document-markdown";

export function MarkdownEditor() {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const documents = useDocumentStore((s) => s.documents);
  const setContent = useDocumentStore((s) => s.setContent);
  const saveStatus = useDocumentStore((s) => s.saveStatus);

  const documentFontSize = useSettingsStore((s) => s.documentFontSize);
  const documentWordWrap = useSettingsStore((s) => s.documentWordWrap);
  const documentSpellCheck = useSettingsStore((s) => s.documentSpellCheck);
  const documentTabSize = useSettingsStore((s) => s.documentTabSize);

  const doc = documents.find((d) => d.id === activeDocumentId);
  const [localContent, setLocalContent] = useState(doc?.contentMarkdown ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLocalContent(doc?.contentMarkdown ?? "");
  }, [activeDocumentId, doc?.contentMarkdown]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setLocalContent(value);
      setContent(value);
    },
    [setContent]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "s") {
          e.preventDefault();
          void useDocumentStore.getState().saveNow();
        }
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;
        const tabSpaces = " ".repeat(documentTabSize);
        const newValue = value.substring(0, start) + tabSpaces + value.substring(end);
        setLocalContent(newValue);
        setContent(newValue);
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + documentTabSize;
        });
      }
    },
    [setContent, documentTabSize]
  );

  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--color-text-dim)]">
        <p className="text-sm">No document open</p>
      </div>
    );
  }

  const wordCount = countWords(localContent);
  const charCount = countCharacters(localContent);

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1 overflow-hidden">
        <textarea
          ref={textareaRef}
          data-document-editor="true"
          value={localContent}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="absolute inset-0 h-full w-full resize-none bg-transparent p-4 font-mono text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)]/50"
          style={{
            fontSize: `${documentFontSize}px`,
            whiteSpace: documentWordWrap ? "pre-wrap" : "pre",
            overflowWrap: documentWordWrap ? "break-word" : undefined,
          }}
          placeholder="Start writing in Markdown..."
          spellCheck={documentSpellCheck}
        />
      </div>
      <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-text-dim)]">
        <div className="flex items-center gap-4">
          <span>{wordCount} words</span>
          <span>{charCount} chars</span>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === "saving" && (
            <span className="text-amber-400">Saving...</span>
          )}
          {saveStatus === "saved" && (
            <span className="text-emerald-400">Saved</span>
          )}
          {saveStatus === "error" && (
            <span className="text-red-400">Save failed</span>
          )}
        </div>
      </div>
    </div>
  );
}
