import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, History, RotateCcw } from "lucide-react";
import { useDocumentStore } from "../document-store";
import { formatDocumentDate, formatVersionNumber } from "../document-export";

export function DocumentVersionList() {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const versions = useDocumentStore((s) => s.versions);
  const loadVersions = useDocumentStore((s) => s.loadVersions);
  const restoreVersion = useDocumentStore((s) => s.restoreVersion);

  const [expanded, setExpanded] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (activeDocumentId) {
      void loadVersions(activeDocumentId);
    }
  }, [activeDocumentId, loadVersions]);

  const handleRestore = async (versionId: string) => {
    if (!confirm("Restore this version? Current content will be replaced.")) return;
    setRestoringId(versionId);
    try {
      await restoreVersion(versionId);
    } finally {
      setRestoringId(null);
    }
  };

  if (!activeDocumentId) return null;

  if (versions.length === 0) {
    return (
      <div className="px-4 py-3 text-center text-xs text-[var(--color-text-dim)]">
        No version history yet
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--color-border)]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
      >
        {expanded ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        <History className="size-3.5" />
        <span>Version History ({versions.length})</span>
      </button>

      {expanded && (
        <div className="max-h-48 overflow-y-auto">
          {versions.map((version) => (
            <div
              key={version.id}
              className="flex items-center justify-between border-t border-[var(--color-border)]/50 px-4 py-2 text-xs hover:bg-white/[0.02]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--color-text)]">
                    {formatVersionNumber(version.versionNumber)}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      version.changeSource === "assistant"
                        ? "bg-indigo-500/20 text-indigo-300"
                        : version.changeSource === "user"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-white/10 text-[var(--color-text-dim)]"
                    }`}
                  >
                    {version.changeSource}
                  </span>
                </div>
                {version.changeSummary && (
                  <p className="mt-0.5 truncate text-[var(--color-text-dim)]">
                    {version.changeSummary}
                  </p>
                )}
                <p className="mt-0.5 text-[10px] text-[var(--color-text-dim)]/70">
                  {formatDocumentDate(version.createdAt)}
                </p>
              </div>
              <button
                type="button"
                title="Restore this version"
                onClick={() => handleRestore(version.id)}
                disabled={restoringId === version.id}
                className="ml-2 grid size-6 place-items-center rounded text-[var(--color-text-dim)] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <RotateCcw className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
