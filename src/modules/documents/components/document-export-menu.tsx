import { useState, useRef, useEffect } from "react";
import { Download, FileText, FileType } from "lucide-react";
import { useDocumentStore } from "../document-store";

export function DocumentExportMenu() {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const exportMarkdown = useDocumentStore((s) => s.exportMarkdown);
  const exportTxt = useDocumentStore((s) => s.exportTxt);

  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

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
        <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] py-1 shadow-xl shadow-black/40">
          <button
            type="button"
            onClick={() => handleExport("md")}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-text)] hover:bg-white/5"
          >
            <FileText className="size-3.5 text-[var(--color-text-dim)]" />
            <span>Markdown (.md)</span>
          </button>
          <button
            type="button"
            onClick={() => handleExport("txt")}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-text)] hover:bg-white/5"
          >
            <FileType className="size-3.5 text-[var(--color-text-dim)]" />
            <span>Plain Text (.txt)</span>
          </button>
        </div>
      )}
    </div>
  );
}
