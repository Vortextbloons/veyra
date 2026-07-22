import { useState, useRef, useCallback } from "react";
import { Download } from "lucide-react";
import { useClickOutside } from "@/hooks/use-click-outside";
import { useDocumentStore, selectActiveDocumentContent } from "../document-store";

export function DocumentExportMenu() {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const exportMarkdown = useDocumentStore((s) => s.exportMarkdown);
  const exportTxt = useDocumentStore((s) => s.exportTxt);

  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, open, () => setOpen(false));

  const handleExport = async (format: "md" | "txt") => {
    setExporting(true);
    setOpen(false);
    try {
      if (format === "md") {
        await exportMarkdown();
      } else {
        await exportTxt();
      }
    } finally {
      setExporting(false);
    }
  };

  const handleCopyToClipboard = useCallback(async () => {
    const content = selectActiveDocumentContent(useDocumentStore.getState());
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setOpen(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in some contexts
    }
  }, []);

  const handlePrint = useCallback(() => {
    setOpen(false);
    window.print();
  }, []);

  if (!activeDocumentId) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        title="Export document"
        onClick={() => setOpen(!open)}
        disabled={exporting}
        className="grid size-7 place-items-center rounded text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
      >
        <Download className="size-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] py-1 shadow-xl shadow-black/40">
          <button
            type="button"
            onClick={() => handleExport("md")}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-text)] hover:bg-white/5"
          >
            <span>Markdown (.md)</span>
          </button>
          <button
            type="button"
            onClick={() => handleExport("txt")}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-text)] hover:bg-white/5"
          >
            <span>Plain Text (.txt)</span>
          </button>
          <div className="my-1 border-t border-[var(--color-border)]" />
          <button
            type="button"
            onClick={handleCopyToClipboard}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-text)] hover:bg-white/5"
          >
            <span>Copy to Clipboard</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-text)] hover:bg-white/5"
          >
            <span>Print</span>
          </button>
        </div>
      )}

      {copied && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs text-white shadow-lg">
          Copied to clipboard
        </div>
      )}
    </div>
  );
}
