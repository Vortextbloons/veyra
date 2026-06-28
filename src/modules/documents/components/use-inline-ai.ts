import { useCallback, useEffect, useRef, useState } from "react";
import { useDocumentStore, selectActiveDocumentContent } from "../document-store";

type InlineEditState = {
  start: number;
  end: number;
  text: string;
  left: number;
  top: number;
};

export type InlineSubmitResult = {
  instruction: string;
  selectedText: string;
  docId: string;
  docTitle: string;
  fullContent: string;
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
  onSubmit?: (result: InlineSubmitResult) => void,
) {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const documents = useDocumentStore((s) => s.documents);
  const activeContent = useDocumentStore(selectActiveDocumentContent);

  const doc = documents.find((d) => d.id === activeDocumentId);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);
  const [inlinePrompt, setInlinePrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

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
      setTimeout(() => inlineInputRef.current?.focus(), 50);
    },
    [doc, textareaRef],
  );

  const updateInlineEditFromSelection = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || !doc) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value.slice(start, end).trim();

    if (!text || start === end) {
      return;
    }

    const coords = selectedTextCoordinates(textarea);
    setInlineEdit({ start, end, text, left: coords.left, top: coords.top });
  }, [doc, textareaRef]);

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
    if (!doc || !inlinePrompt.trim() || isSubmitting) return;

    const instruction = inlinePrompt.trim();
    const selectedText = inlineEdit?.text ?? "";

    if (onSubmit) {
      setIsSubmitting(true);
      onSubmit({
        instruction,
        selectedText,
        docId: doc.id,
        docTitle: doc.title,
        fullContent: activeContent,
      });
      setInlineEdit(null);
      setInlinePrompt("");
      setIsSubmitting(false);
      textareaRef.current?.focus();
      return;
    }

    let prompt: string;
    if (selectedText) {
      prompt = `Use the doc_update tool to edit the active document with mode replace_text. Set target to the exact selected text below, and set contentMarkdown to the rewritten replacement only.\n\nDocument id: ${doc.id}\nDocument title: ${doc.title}\nInstruction: ${instruction}\n\nSelected text target:\n${selectedText}\n\nImportant: preserve the rest of the document unchanged and apply the edit directly to the document.`;
    } else {
      prompt = `Use the doc_update tool to edit the active document with mode replace_all. Set contentMarkdown to the full rewritten document.\n\nDocument id: ${doc.id}\nDocument title: ${doc.title}\nInstruction: ${instruction}\n\nCurrent document content:\n${activeContent}\n\nImportant: rewrite the entire document following the instruction.`;
    }

    window.dispatchEvent(
      new CustomEvent("veyra:inline-document-edit", {
        detail: { prompt },
      }),
    );
    setInlineEdit(null);
    setInlinePrompt("");
    textareaRef.current?.focus();
  }, [doc, inlineEdit, inlinePrompt, activeContent, textareaRef, onSubmit, isSubmitting]);

  const dismissInlineEdit = useCallback(() => {
    setInlineEdit(null);
    textareaRef.current?.focus();
  }, [textareaRef]);

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
  };
}
