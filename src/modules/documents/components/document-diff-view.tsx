import { useMemo, useState } from "react";
import { diffLines, type Change } from "diff";
import { X, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentDiffViewProps {
  oldContent: string;
  newContent: string;
  oldLabel?: string;
  newLabel?: string;
  onClose: () => void;
}

type DiffMode = "side-by-side" | "unified";

export function DocumentDiffView({
  oldContent,
  newContent,
  oldLabel = "Previous",
  newLabel = "Current",
  onClose,
}: DocumentDiffViewProps) {
  const [mode, setMode] = useState<DiffMode>("side-by-side");

  const changes = useMemo(() => diffLines(oldContent, newContent), [oldContent, newContent]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const change of changes) {
      const lines = change.value.split("\n").filter(Boolean).length;
      if (change.added) added += lines;
      if (change.removed) removed += lines;
    }
    return { added, removed };
  }, [changes]);

  return (
    <div className="flex h-full flex-col bg-[var(--color-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
        <div className="flex items-center gap-3">
          <h3 className="text-[13px] font-semibold text-[var(--color-text)]">Document Comparison</h3>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-emerald-400">+{stats.added}</span>
            <span className="text-red-400">-{stats.removed}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setMode("side-by-side")}
              className={cn(
                "px-2 py-1 text-[11px] transition-colors",
                mode === "side-by-side"
                  ? "bg-[var(--color-accent-soft)] text-white"
                  : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
              )}
            >
              Side by Side
            </button>
            <button
              type="button"
              onClick={() => setMode("unified")}
              className={cn(
                "px-2 py-1 text-[11px] transition-colors",
                mode === "unified"
                  ? "bg-[var(--color-accent-soft)] text-white"
                  : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
              )}
            >
              Unified
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-6 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Labels */}
      {mode === "side-by-side" && (
        <div className="flex border-b border-[var(--color-border)]">
          <div className="flex-1 px-4 py-1.5 text-[11px] font-medium text-[var(--color-text-dim)] border-r border-[var(--color-border)]">
            {oldLabel}
          </div>
          <div className="flex-1 px-4 py-1.5 text-[11px] font-medium text-[var(--color-text-dim)]">
            {newLabel}
          </div>
        </div>
      )}

      {/* Diff content */}
      <div className="flex-1 overflow-auto">
        {mode === "side-by-side" ? (
          <SideBySideDiff changes={changes} />
        ) : (
          <UnifiedDiff changes={changes} />
        )}
      </div>
    </div>
  );
}

function SideBySideDiff({ changes }: { changes: Change[] }) {
  const rows = useMemo(() => {
    const result: Array<{ old?: string; new?: string; type: "same" | "added" | "removed" }> = [];

    for (const change of changes) {
      const lines = change.value.split("\n").filter((line, i, arr) => line !== "" || i < arr.length - 1);

      if (change.added) {
        for (const line of lines) {
          result.push({ new: line, type: "added" });
        }
      } else if (change.removed) {
        for (const line of lines) {
          result.push({ old: line, type: "removed" });
        }
      } else {
        for (const line of lines) {
          result.push({ old: line, new: line, type: "same" });
        }
      }
    }

    return result;
  }, [changes]);

  return (
    <div className="font-mono text-[11px]">
      {rows.map((row, i) => (
        <div key={i} className="flex min-h-[20px]">
          <div
            className={cn(
              "flex-1 border-r border-[var(--color-border)] px-3 py-0.5 whitespace-pre-wrap break-all",
              row.type === "removed" ? "bg-red-500/10 text-red-400" : "text-[var(--color-text-dim)]",
            )}
          >
            {row.old ?? ""}
          </div>
          <div
            className={cn(
              "flex-1 px-3 py-0.5 whitespace-pre-wrap break-all",
              row.type === "added" ? "bg-emerald-500/10 text-emerald-400" : "text-[var(--color-text-dim)]",
            )}
          >
            {row.new ?? ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function UnifiedDiff({ changes }: { changes: Change[] }) {
  const lines = useMemo(() => {
    const result: Array<{ content: string; type: "same" | "added" | "removed" }> = [];

    for (const change of changes) {
      const content = change.value.split("\n").filter((line, i, arr) => line !== "" || i < arr.length - 1);
      const type = change.added ? "added" : change.removed ? "removed" : "same";

      for (const line of content) {
        result.push({ content: line, type });
      }
    }

    return result;
  }, [changes]);

  return (
    <div className="font-mono text-[11px]">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            "min-h-[20px] px-3 py-0.5 whitespace-pre-wrap break-all",
            line.type === "added"
              ? "bg-emerald-500/10 text-emerald-400"
              : line.type === "removed"
                ? "bg-red-500/10 text-red-400"
                : "text-[var(--color-text-dim)]",
          )}
        >
          <span className="mr-2 inline-block w-4 text-right text-[var(--color-text-dim)] opacity-50">
            {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
          </span>
          {line.content}
        </div>
      ))}
    </div>
  );
}

// Version compare trigger component
interface VersionCompareButtonProps {
  versions: Array<{ id: string; versionNumber: number; contentMarkdown: string; createdAt: string }>;
  onCompare: (oldContent: string, newContent: string, oldLabel: string, newLabel: string) => void;
}

export function VersionCompareButton({ versions, onCompare }: VersionCompareButtonProps) {
  const [selectedOld, setSelectedOld] = useState<string | null>(null);
  const [selectedNew, setSelectedNew] = useState<string | null>(null);

  const handleCompare = () => {
    if (!selectedOld || !selectedNew) return;
    const oldVersion = versions.find((v) => v.id === selectedOld);
    const newVersion = versions.find((v) => v.id === selectedNew);
    if (!oldVersion || !newVersion) return;

    const oldLabel = `Version ${oldVersion.versionNumber}`;
    const newLabel = `Version ${newVersion.versionNumber}`;
    onCompare(oldVersion.contentMarkdown, newVersion.contentMarkdown, oldLabel, newLabel);
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedOld ?? ""}
        onChange={(e) => setSelectedOld(e.target.value || null)}
        className="rounded-md border border-[var(--color-border)] bg-white/[0.03] px-2 py-1 text-[11px] text-[var(--color-text)] focus:border-[var(--color-accent)]/50 focus:outline-none"
      >
        <option value="">Select version...</option>
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            Version {v.versionNumber}
          </option>
        ))}
      </select>
      <ArrowLeftRight className="size-3 text-[var(--color-text-dim)]" />
      <select
        value={selectedNew ?? ""}
        onChange={(e) => setSelectedNew(e.target.value || null)}
        className="rounded-md border border-[var(--color-border)] bg-white/[0.03] px-2 py-1 text-[11px] text-[var(--color-text)] focus:border-[var(--color-accent)]/50 focus:outline-none"
      >
        <option value="">Select version...</option>
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            Version {v.versionNumber}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleCompare}
        disabled={!selectedOld || !selectedNew}
        className="rounded-md bg-[var(--color-accent)] px-2 py-1 text-[11px] font-medium text-white hover:brightness-110 disabled:opacity-40"
      >
        Compare
      </button>
    </div>
  );
}
