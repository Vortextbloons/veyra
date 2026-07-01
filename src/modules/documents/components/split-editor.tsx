import { useCallback, useEffect, useRef, useState } from "react";
import { WandSparkles, Send, X, Loader2 } from "lucide-react";
import { selectActiveDocumentContent, useDocumentStore } from "../document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { countWords, countCharacters } from "../document-markdown";
import { buildAiMessages, streamAiAssist } from "../document-ai";
import type { InlineStreamParams } from "./use-inline-ai";
import { MarkdownPreview } from "./markdown-preview";
import { useInlineAi } from "./use-inline-ai";
import { InlineDiffPreview } from "./inline-diff-preview";

export function SplitEditor({ onOpenAiPanel }: { onOpenAiPanel?: () => void }) {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const activeContent = useDocumentStore(selectActiveDocumentContent);
  const documents = useDocumentStore((s) => s.documents);
  const setContent = useDocumentStore((s) => s.setContent);
  const saveStatus = useDocumentStore((s) => s.saveStatus);
  const viewMode = useDocumentStore((s) => s.viewMode);
  const versions = useDocumentStore((s) => s.versions);

  const documentFontSize = useSettingsStore((s) => s.documentFontSize);
  const documentWordWrap = useSettingsStore((s) => s.documentWordWrap);
  const documentSpellCheck = useSettingsStore((s) => s.documentSpellCheck);
  const documentTabSize = useSettingsStore((s) => s.documentTabSize);

  const doc = documents.find((d) => d.id === activeDocumentId);
  const [localContent, setLocalContent] = useState(activeContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [splitPosition, setSplitPosition] = useState(50);
  const isDragging = useRef(false);

  const handleApplyEdit = useCallback(
    (newContent: string) => {
      setContent(newContent);
    },
    [setContent],
  );

  const handleStreamEdit = useCallback(
    (params: InlineStreamParams) => {
      const { instruction, selectedText, docTitle, fullContent, signal, onChunk, onComplete, onError } =
        params;

      const aiMessages = buildAiMessages(
        fullContent,
        docTitle,
        "custom",
        instruction,
        selectedText || undefined,
      );

      let accumulated = "";
      void streamAiAssist({
        messages: aiMessages,
        reasoningEnabled: false,
        signal,
        onChunk: (chunk, done) => {
          if (!done) {
            accumulated += chunk;
            onChunk(chunk);
          } else {
            onComplete(accumulated);
          }
        },
        onError: (error) => {
          onError(error);
        },
      });
    },
    [],
  );

  const {
    inlineEdit,
    inlinePrompt,
    setInlinePrompt,
    inlineInputRef,
    popupRef,
    showInlineEdit,
    updateInlineEditFromSelection,
    submitInlineEdit,
    dismissInlineEdit,
    isGenerating,
    pendingEdit,
    acceptEdit,
    rejectEdit,
  } = useInlineAi(textareaRef, handleStreamEdit, handleApplyEdit);

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
    [setContent],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "s") {
          e.preventDefault();
          void useDocumentStore.getState().saveNow();
        }
        if (e.key === "k") {
          e.preventDefault();
          showInlineEdit();
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
    [setContent, documentTabSize, showInlineEdit],
  );

  const handleTextareaScroll = useCallback(() => {
    if (viewMode !== "split") return;
    const textarea = textareaRef.current;
    const preview = previewRef.current;
    if (!textarea || !preview) return;
    const pct = textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight || 1);
    preview.scrollTop = pct * (preview.scrollHeight - preview.clientHeight);
  }, [viewMode]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const container = (e.target as HTMLElement).parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPosition(Math.min(80, Math.max(20, pct)));
    };
    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--color-text-dim)]">
        <p className="text-sm">No document open</p>
      </div>
    );
  }

  const wordCount = countWords(localContent);
  const charCount = countCharacters(localContent);
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  const textarea = (
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
        onScroll={handleTextareaScroll}
        onBlur={() => {
          window.setTimeout(() => {
            if (popupRef.current?.contains(document.activeElement)) return;
            dismissInlineEdit();
          }, 150);
        }}
        onKeyDown={handleKeyDown}
        className="absolute inset-0 h-full w-full resize-none bg-transparent p-4 font-mono text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)]/50"
        style={{
          fontSize: `${documentFontSize}px`,
          whiteSpace: documentWordWrap ? "pre-wrap" : "pre",
          overflowWrap: documentWordWrap ? "break-word" : undefined,
        }}
        placeholder="Start writing in Markdown... (⌘K for AI assist)"
        spellCheck={documentSpellCheck}
      />
      {inlineEdit && (
        <div
          ref={popupRef}
          className="absolute z-20 w-[310px] overflow-hidden rounded-2xl border border-emerald-300/25 bg-[#08120f]/95 shadow-2xl shadow-emerald-950/40 backdrop-blur-xl"
          style={{ left: inlineEdit.left, top: inlineEdit.top }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="border-b border-white/10 bg-emerald-400/[0.08] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
              {isGenerating ? "Generating..." : "AI Assist"}
            </p>
            {inlineEdit.text ? (
              <p className="mt-1 truncate text-xs text-white/55">{inlineEdit.text}</p>
            ) : (
              <p className="mt-1 text-xs text-white/40">No selection — will edit full document</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 px-3 py-2">
            <input
              ref={inlineInputRef}
              type="text"
              value={inlinePrompt}
              onChange={(e) => setInlinePrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitInlineEdit();
                }
                if (e.key === "Escape") {
                  dismissInlineEdit();
                }
              }}
              placeholder="Tell AI what to do..."
              disabled={isGenerating}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-emerald-400/40 focus:outline-none disabled:opacity-40"
            />
            {isGenerating ? (
              <div className="grid size-7 shrink-0 place-items-center">
                <Loader2 className="size-3.5 animate-spin text-emerald-300" />
              </div>
            ) : (
              <button
                type="button"
                onClick={submitInlineEdit}
                disabled={!inlinePrompt.trim()}
                className="grid size-7 shrink-0 place-items-center rounded-lg bg-emerald-400/20 text-emerald-300 hover:bg-emerald-400/30 disabled:opacity-30 transition-colors"
              >
                <Send className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={dismissInlineEdit}
              className="grid size-7 shrink-0 place-items-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white/70 transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const preview = <MarkdownPreview content={localContent} className="flex-1" />;

  return (
    <>
      <div className="split-editor relative flex h-full flex-col">
        <div className="flex min-h-0 flex-1">
          {viewMode === "source" && textarea}
          {viewMode === "preview" && preview}
          {viewMode === "split" && (
            <>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ width: `${splitPosition}%` }}>
                {textarea}
              </div>
              <div
                className="w-1 shrink-0 cursor-col-resize bg-[var(--color-border)] hover:bg-[var(--color-accent)]/50 transition-colors"
                onMouseDown={handleDragStart}
              />
              <div
                ref={previewRef}
                className="min-h-0 flex-1 overflow-y-auto"
                style={{ width: `${100 - splitPosition}%` }}
              >
                {preview}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-text-dim)]">
          <div className="flex items-center gap-4">
            <span>{wordCount} words</span>
            <span>{charCount} chars</span>
            <span>{readingTime} min read</span>
          </div>
          <div className="flex items-center gap-3">
            {versions.length > 0 && (
              <span>v{versions[0]?.versionNumber ?? 1}</span>
            )}
            {saveStatus === "saving" && <span className="text-amber-400">Saving...</span>}
            {saveStatus === "saved" && <span className="text-emerald-400">Saved</span>}
            {saveStatus === "error" && <span className="text-red-400">Save failed</span>}
            <button
              type="button"
              onClick={onOpenAiPanel}
              className="flex items-center gap-1 rounded-md bg-[var(--color-accent)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)]/25 transition-colors"
            >
              <WandSparkles className="size-3" />
              AI Assist
            </button>
          </div>
        </div>
      </div>
      {pendingEdit && (
        <InlineDiffPreview
          originalText={pendingEdit.originalText}
          proposedText={pendingEdit.proposedText}
          explanation={pendingEdit.explanation}
          onAccept={acceptEdit}
          onReject={rejectEdit}
        />
      )}
    </>
  );
}
