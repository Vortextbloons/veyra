import { WandSparkles, Scissors, StretchHorizontal, Languages, MessageSquareQuote } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { selectActiveDocumentContent, useDocumentStore } from "../document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { countWords, countCharacters } from "../document-markdown";

type InlineEditAction = {
  id: string;
  label: string;
  icon: React.ReactNode;
  instruction: string;
};

const INLINE_ACTIONS: InlineEditAction[] = [
  {
    id: "improve",
    label: "Improve",
    icon: <WandSparkles className="size-3.5" />,
    instruction: "Improve the selected text for clarity, flow, and polish while preserving the original meaning.",
  },
  {
    id: "shorten",
    label: "Shorten",
    icon: <Scissors className="size-3.5" />,
    instruction: "Make the selected text more concise without losing important meaning.",
  },
  {
    id: "expand",
    label: "Expand",
    icon: <StretchHorizontal className="size-3.5" />,
    instruction: "Expand the selected text with useful detail while matching the document's tone.",
  },
  {
    id: "tone",
    label: "Refine Tone",
    icon: <MessageSquareQuote className="size-3.5" />,
    instruction: "Rewrite the selected text to sound more professional and natural.",
  },
  {
    id: "plain",
    label: "Plain English",
    icon: <Languages className="size-3.5" />,
    instruction: "Rewrite the selected text in clear, plain English.",
  },
];

function selectedTextCoordinates(textarea: HTMLTextAreaElement) {
  const rect = textarea.getBoundingClientRect();
  return {
    left: Math.min(rect.width - 300, Math.max(12, rect.width * 0.18)),
    top: Math.min(rect.height - 92, Math.max(12, rect.height * 0.12)),
  };
}

export function MarkdownEditor() {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const activeContent = useDocumentStore(selectActiveDocumentContent);
  const documents = useDocumentStore((s) => s.documents);
  const setContent = useDocumentStore((s) => s.setContent);
  const saveStatus = useDocumentStore((s) => s.saveStatus);

  const documentFontSize = useSettingsStore((s) => s.documentFontSize);
  const documentWordWrap = useSettingsStore((s) => s.documentWordWrap);
  const documentSpellCheck = useSettingsStore((s) => s.documentSpellCheck);
  const documentTabSize = useSettingsStore((s) => s.documentTabSize);

  const doc = documents.find((d) => d.id === activeDocumentId);
  const [localContent, setLocalContent] = useState(activeContent);
  const [inlineEdit, setInlineEdit] = useState<{
    start: number;
    end: number;
    text: string;
    left: number;
    top: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setLocalContent(activeContent), 0);
    return () => window.clearTimeout(timer);
  }, [activeDocumentId, activeContent]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setLocalContent(value);
      setContent(value);
    },
    [setContent]
  );

  const updateInlineEditFromSelection = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || !doc) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value.slice(start, end).trim();

    if (!text || start === end) {
      setInlineEdit(null);
      return;
    }

    const coords = selectedTextCoordinates(textarea);
    setInlineEdit({ start, end, text, left: coords.left, top: coords.top });
  }, [doc]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const textarea = textareaRef.current;
      if (!textarea || document.activeElement !== textarea) {
        setInlineEdit(null);
        return;
      }

      const hasHighlight = textarea.selectionStart !== textarea.selectionEnd;
      if (!hasHighlight) {
        setInlineEdit(null);
        return;
      }

      updateInlineEditFromSelection();
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [updateInlineEditFromSelection]);

  const runInlineEdit = useCallback(
    (action: InlineEditAction) => {
      if (!doc || !inlineEdit) return;

      const prompt = `Use the doc_update tool to edit the active document with mode replace_text. Set target to the exact selected text below, and set contentMarkdown to the rewritten replacement only.\n\nDocument id: ${doc.id}\nDocument title: ${doc.title}\nAction: ${action.label}\nInstruction: ${action.instruction}\n\nSelected text target:\n${inlineEdit.text}\n\nImportant: preserve the rest of the document unchanged and apply the edit directly to the document.`;

      window.dispatchEvent(
        new CustomEvent("veyra:inline-document-edit", {
          detail: { prompt },
        }),
      );
      setInlineEdit(null);
      textareaRef.current?.focus();
    },
    [doc, inlineEdit],
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
          onSelect={updateInlineEditFromSelection}
          onMouseUp={updateInlineEditFromSelection}
          onKeyUp={updateInlineEditFromSelection}
          onClick={updateInlineEditFromSelection}
          onBlur={() => window.setTimeout(() => setInlineEdit(null), 160)}
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
        {inlineEdit && (
          <div
            className="absolute z-20 w-[288px] overflow-hidden rounded-2xl border border-emerald-300/25 bg-[#08120f]/95 shadow-2xl shadow-emerald-950/40 backdrop-blur-xl"
            style={{ left: inlineEdit.left, top: inlineEdit.top }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="border-b border-white/10 bg-emerald-400/[0.08] px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">Inline AI Edit</p>
              <p className="mt-1 truncate text-xs text-white/55">{inlineEdit.text}</p>
            </div>
            <div className="grid grid-cols-2 gap-1 p-1.5">
              {INLINE_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => runInlineEdit(action)}
                  className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-white/80 transition hover:bg-emerald-300/12 hover:text-emerald-100"
                >
                  <span className="grid size-6 place-items-center rounded-lg bg-emerald-300/10 text-emerald-200">
                    {action.icon}
                  </span>
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}
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
