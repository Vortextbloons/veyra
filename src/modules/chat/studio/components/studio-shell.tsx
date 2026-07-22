import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Code2,
  Copy,
  Download,
  History,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";
import type { StudioArtifact } from "../studio-types";
import { getCachedStudioDocument } from "../studio-document-cache";
import { exportStudioRevisionToFile } from "../studio-export";
import { previousStudioRevision } from "../studio-normalize";

type StudioShellProps = {
  artifact?: StudioArtifact;
  artifactId?: string;
  generating: boolean;
  validationError?: string | null;
  onClose: () => void;
  onUndo?: () => void;
  onSelectRevision?: (revision: number) => void;
  onRegenerate?: (assistantMessageId: string) => void;
};

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reducedMotion;
}

export function StudioShell({
  artifact,
  artifactId,
  generating,
  validationError,
  onClose,
  onUndo,
  onSelectRevision,
  onRegenerate,
}: StudioShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [source, setSource] = useState<"html" | "css" | null>(null);
  const [copied, setCopied] = useState<"html" | "css" | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const revision = artifact?.revisions.find((item) => item.revision === artifact.currentRevision);
  const priorRevision = artifact ? previousStudioRevision(artifact) : null;
  const hasNewerRevision = Boolean(artifact && artifact.latestRevision > artifact.currentRevision);
  const studioDocument = useMemo(() => {
    if (!revision || !artifactId) return "";
    return getCachedStudioDocument({
      artifactId,
      revision: revision.revision,
      title: revision.title,
      html: revision.html,
      css: revision.css,
      reducedMotion,
    });
  }, [artifactId, reducedMotion, revision]);
  const sortedRevisions = useMemo(
    () => [...(artifact?.revisions ?? [])].sort((a, b) => b.revision - a.revision),
    [artifact?.revisions],
  );

  useEffect(() => {
    if (!historyOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHistoryOpen(false);
        historyButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [historyOpen]);

  const copy = async (kind: "html" | "css") => {
    if (!revision) return;
    await navigator.clipboard.writeText(revision[kind]);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1200);
  };

  const handleExport = async () => {
    if (!revision) return;
    setExportError(null);
    try {
      await exportStudioRevisionToFile(revision);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed.");
    }
  };

  const statusLabel = generating
    ? "Generating"
    : validationError
      ? "Rejected"
      : revision
        ? "Ready"
        : "Empty";

  const toolbarButtonClass =
    "rounded p-1.5 text-white/55 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <section
      aria-label="Studio"
      className={`${fullscreen ? "absolute inset-0 z-40" : "h-full w-full"} flex min-h-0 flex-col overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-panel)]`}
    >
      <header className="shrink-0 border-b border-[var(--color-border)]">
        <div className="flex h-11 items-center gap-2 px-3">
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[.16em] text-violet-300">Studio</span>
          <span className="min-w-0 flex-1 truncate text-xs text-white/80">
            {revision?.title ?? "Visual canvas"}
            {revision ? ` · r${revision.revision}` : ""}
          </span>
          <span aria-live="polite" className="shrink-0 text-[10px] text-[var(--color-text-dim)]">{statusLabel}</span>
          <button
            title={collapsed ? "Expand Studio" : "Collapse Studio"}
            aria-label={collapsed ? "Expand Studio" : "Collapse Studio"}
            onClick={() => setCollapsed(!collapsed)}
            className={toolbarButtonClass}
          >
            {collapsed ? <PanelRightOpen className="size-3.5" /> : <PanelRightClose className="size-3.5" />}
          </button>
          <button
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={() => setFullscreen(!fullscreen)}
            className={toolbarButtonClass}
          >
            {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
          <button title="Close Studio" aria-label="Close Studio" onClick={onClose} className={toolbarButtonClass}>
            <X className="size-3.5" />
          </button>
        </div>
        {revision && !collapsed && (
          <div className="flex h-9 items-center gap-0.5 overflow-x-auto border-t border-white/[0.04] px-2">
            <button title="Undo revision" aria-label="Undo revision" disabled={!priorRevision} onClick={onUndo} className={toolbarButtonClass}>
              <Undo2 className="size-3.5" />
            </button>
            <div className="relative shrink-0">
              <button
                ref={historyButtonRef}
                title="Revision history"
                aria-label="Revision history"
                aria-expanded={historyOpen}
                aria-haspopup="menu"
                onClick={() => setHistoryOpen((open) => !open)}
                className={toolbarButtonClass}
              >
                <History className="size-3.5" />
              </button>
              {historyOpen && (
                <div role="menu" className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-[var(--color-border)] bg-[#111218] p-1 shadow-xl">
                  {sortedRevisions.map((item) => (
                    <button
                      key={item.revision}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onSelectRevision?.(item.revision);
                        setHistoryOpen(false);
                        historyButtonRef.current?.focus();
                      }}
                      className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[11px] ${
                        item.revision === artifact?.currentRevision
                          ? "bg-violet-500/15 text-violet-200"
                          : "text-white/70 hover:bg-white/5"
                      }`}
                    >
                      <span className="truncate">r{item.revision} · {item.title}</span>
                      {item.revision === artifact?.latestRevision && (
                        <span className="ml-2 shrink-0 text-[10px] text-white/35">latest</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button title="Reload canvas" aria-label="Reload canvas" onClick={() => setIframeKey((value) => value + 1)} className={toolbarButtonClass}>
              <RefreshCw className="size-3.5" />
            </button>
            <button
              title="Regenerate artifact"
              aria-label="Regenerate artifact"
              onClick={() => revision && onRegenerate?.(revision.assistantMessageId)}
              className={toolbarButtonClass}
            >
              <RotateCcw className="size-3.5" />
            </button>
            <button title="Export HTML" aria-label="Export HTML" onClick={() => void handleExport()} className={toolbarButtonClass}>
              <Download className="size-3.5" />
            </button>
            <button
              title="View source"
              aria-label="View source"
              onClick={() => setSource(source ? null : "html")}
              className={`${toolbarButtonClass} ${source ? "bg-violet-500/15 text-violet-200" : ""}`}
            >
              <Code2 className="size-3.5" />
            </button>
          </div>
        )}
      </header>
      {!collapsed && (
        <div className="relative min-h-0 flex-1 overflow-hidden bg-[#0b0c10]">
          {hasNewerRevision && (
            <div className="absolute left-3 right-3 top-3 z-10 flex items-center justify-between gap-2 rounded-md border border-violet-400/20 bg-[#111218]/95 px-3 py-2 text-[11px] text-violet-100">
              <span>A newer revision is available.</span>
              <button
                type="button"
                className="rounded bg-violet-500/15 px-2 py-1 text-[10px] text-violet-200"
                onClick={() => artifact && onSelectRevision?.(artifact.latestRevision)}
              >
                View latest
              </button>
            </div>
          )}
          {source && revision ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-1 border-b border-[var(--color-border)] p-2">
                {(["html", "css"] as const).map((kind) => (
                  <button
                    key={kind}
                    onClick={() => setSource(kind)}
                    className={`rounded px-2 py-1 text-[11px] uppercase ${
                      source === kind ? "bg-violet-500/15 text-violet-200" : "text-white/50"
                    }`}
                  >
                    {kind}
                  </button>
                ))}
                <span className="ml-auto text-[10px] text-white/35">
                  {new TextEncoder().encode(revision[source]).byteLength.toLocaleString()} bytes
                </span>
                <button
                  onClick={() => void copy(source)}
                  className="rounded p-1.5 text-white/55 hover:bg-white/5"
                  aria-label={`Copy ${source.toUpperCase()}`}
                >
                  {copied === source ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </button>
              </div>
              <textarea
                readOnly
                spellCheck={false}
                value={revision[source]}
                aria-label={`${source.toUpperCase()} source`}
                className="min-h-0 flex-1 resize-none bg-[#0b0c10] p-4 font-mono text-[11px] leading-relaxed text-white/70 outline-none"
              />
            </div>
          ) : revision ? (
            <iframe
              key={iframeKey}
              title={revision.title}
              sandbox=""
              allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; display-capture 'none'; fullscreen 'none'; payment 'none'; usb 'none'; serial 'none'; bluetooth 'none'"
              referrerPolicy="no-referrer"
              srcDoc={studioDocument}
              className="absolute inset-0 block h-full w-full border-0 bg-transparent"
            />
          ) : validationError ? (
            <div className="grid h-full place-items-center p-8 text-center">
              <div className="max-w-sm">
                <p className="text-sm font-medium text-red-200">Studio render rejected</p>
                <p className="mt-2 text-xs leading-relaxed text-white/45">{validationError}</p>
              </div>
            </div>
          ) : (
            <div className="grid h-full place-items-center p-8 text-center">
              <div>
                <p className="text-sm font-medium text-white/80">Studio is ready</p>
                <p className="mt-2 max-w-xs text-xs leading-relaxed text-white/40">
                  Ask for a dashboard, timeline, comparison, planner, or another visual response.
                </p>
              </div>
            </div>
          )}
          {generating && revision && (
            <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-violet-400/20 bg-[#111218]/90 px-2.5 py-1 text-[10px] text-violet-200 shadow-lg">
              Creating next view…
            </div>
          )}
          {validationError && revision && (
            <div className="absolute bottom-3 left-3 right-3 rounded-md border border-red-500/20 bg-[#111218]/95 px-3 py-2 text-[11px] text-red-200">
              {validationError}
            </div>
          )}
          {exportError && (
            <div className="absolute bottom-3 left-3 right-3 rounded-md border border-red-500/20 bg-[#111218]/95 px-3 py-2 text-[11px] text-red-200">
              {exportError}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
