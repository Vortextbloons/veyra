import { useCallback, useEffect, useRef, useState } from "react";
import { useDocumentStore, selectActiveDocumentContent } from "../document-store";

type InlineEditState = {
  start: number;
  end: number;
  text: string;
  left: number;
  top: number;
};

export type PendingInlineEdit = {
  originalText: string;
  proposedText: string;
  selectionStart: number;
  selectionEnd: number;
  explanation?: string;
};

export type InlineStreamParams = {
  instruction: string;
  selectedText: string;
  docId: string;
  docTitle: string;
  fullContent: string;
  signal: AbortSignal;
  onChunk: (chunk: string) => void;
  onComplete: (fullResponse: string) => void;
  onError: (error: string) => void;
};

function selectedTextCoordinates(textarea: HTMLTextAreaElement) {
  const rect = textarea.getBoundingClientRect();
  return {
    left: Math.min(rect.width - 320, Math.max(12, rect.width * 0.18)),
    top: Math.min(rect.height - 100, Math.max(12, rect.height * 0.12)),
  };
}

export function useInlineAi(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  streamEdit: (params: InlineStreamParams) => void,
  onApplyEdit: (newContent: string) => void,
) {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const documents = useDocumentStore((s) => s.documents);
  const activeContent = useDocumentStore(selectActiveDocumentContent);

  const doc = documents.find((d) => d.id === activeDocumentId);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);
  const [inlinePrompt, setInlinePrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<PendingInlineEdit | null>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  const showInlineEdit = useCallback(
    (start?: number, end?: number) => {
      const textarea = textareaRef.current;
      if (!textarea || !doc) return;

      const selStart = start ?? textarea.selectionStart;
      const selEnd = end ?? textarea.selectionEnd;
      const text = textarea.value.slice(selStart, selEnd).trim();

      const coords = selectedTextCoordinates(textarea);
      setInlineEdit({ start: selStart, end: selEnd, text, left: coords.left, top: coords.top });
      setInlinePrompt("");
      setPendingEdit(null);
      setTimeout(() => inlineInputRef.current?.focus(), 50);
    },
    [doc, textareaRef],
  );

  const updateInlineEditFromSelection = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || !doc || isGenerating) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value.slice(start, end).trim();

    if (!text || start === end) {
      return;
    }

    const coords = selectedTextCoordinates(textarea);
    setInlineEdit({ start, end, text, left: coords.left, top: coords.top });
  }, [doc, textareaRef, isGenerating]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const textarea = textareaRef.current;
      if (!textarea || document.activeElement !== textarea) {
        return;
      }

      const hasHighlight = textarea.selectionStart !== textarea.selectionEnd;
      if (!hasHighlight) {
        return;
      }

      updateInlineEditFromSelection();
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [updateInlineEditFromSelection, textareaRef]);

  const submitInlineEdit = useCallback(() => {
    if (!doc || !inlinePrompt.trim() || isGenerating) return;

    const instruction = inlinePrompt.trim();
    const selectedText = inlineEdit?.text ?? "";
    const selStart = inlineEdit?.start ?? 0;
    const selEnd = inlineEdit?.end ?? 0;

    const controller = new AbortController();
    abortRef.current = controller;
    cancelledRef.current = false;

    setIsGenerating(true);
    setPendingEdit(null);

    streamEdit({
      instruction,
      selectedText,
      docId: doc.id,
      docTitle: doc.title,
      fullContent: activeContent,
      signal: controller.signal,
      onChunk: () => {},
      onComplete: (fullResponse) => {
        if (cancelledRef.current) return;
        setIsGenerating(false);
        setPendingEdit({
          originalText: selectedText || activeContent,
          proposedText: fullResponse,
          selectionStart: selStart,
          selectionEnd: selEnd,
        });
      },
      onError: () => {
        if (cancelledRef.current) return;
        setIsGenerating(false);
      },
    });

    setInlinePrompt("");
  }, [doc, inlineEdit, inlinePrompt, activeContent, isGenerating, streamEdit]);

  const acceptEdit = useCallback(() => {
    if (!pendingEdit) return;

    const { proposedText, selectionStart, selectionEnd } = pendingEdit;
    const isSelectionEdit = selectionStart !== selectionEnd;

    if (isSelectionEdit) {
      const before = activeContent.slice(0, selectionStart);
      const after = activeContent.slice(selectionEnd);
      onApplyEdit(before + proposedText + after);
    } else {
      onApplyEdit(proposedText);
    }

    setPendingEdit(null);
    setInlineEdit(null);
    textareaRef.current?.focus();
  }, [pendingEdit, activeContent, onApplyEdit, textareaRef]);

  const rejectEdit = useCallback(() => {
    setPendingEdit(null);
    textareaRef.current?.focus();
  }, [textareaRef]);

  const dismissInlineEdit = useCallback(() => {
    if (isGenerating) {
      cancelledRef.current = true;
      abortRef.current?.abort();
      setIsGenerating(false);
    }
    setInlineEdit(null);
    setPendingEdit(null);
    textareaRef.current?.focus();
  }, [textareaRef, isGenerating]);

  return {
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
  };
}
