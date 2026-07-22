import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  Download,
  History,
  RefreshCw,
  Undo2,
} from "lucide-react";
import type { StudioResponse } from "../studio-types";
import { getCachedStudioDocument } from "../studio-document-cache";
import { exportStudioRevisionToFile } from "../studio-export";
import { previousStudioResponseRevision } from "../studio-normalize";
import { useChatStore } from "@/stores/chat-store";

type StudioResponseViewProps = {
  conversationId: string;
  assistantMessageId: string;
  response: StudioResponse;
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

const actionClass = "grid size-8 shrink-0 place-items-center rounded-md text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 disabled:pointer-events-none disabled:opacity-25";

export function StudioResponseView({
  conversationId,
  assistantMessageId,
  response,
}: StudioResponseViewProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [source, setSource] = useState<"html" | "css" | null>(null);
  const [copied, setCopied] = useState<"document" | "source" | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const revision = response.revisions.find((item) => item.revision === response.currentRevision);
  const previousRevision = previousStudioResponseRevision(response);
  const hasNewerRevision = response.latestRevision > response.currentRevision;
  const revisions = useMemo(
    () => [...response.revisions].sort((a, b) => b.revision - a.revision),
    [response.revisions],
  );
  const document = useMemo(() => revision
    ? getCachedStudioDocument({
        artifactId: response.id,
        revision: revision.revision,
        title: revision.title,
        html: revision.html,
        css: revision.css,
        reducedMotion,
      })
    : "", [reducedMotion, response.id, revision]);

  useEffect(() => {
    if (!historyOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setHistoryOpen(false);
      historyButtonRef.current?.focus();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [historyOpen]);

  const selectRevision = (number: number) => {
    useChatStore.getState().selectStudioResponseRevision(conversationId, assistantMessageId, number);
    setHistoryOpen(false);
    historyButtonRef.current?.focus();
  };

  const copySource = async () => {
    if (!revision) return;
    await navigator.clipboard.writeText(source === "css" ? revision.css : revision.html);
    setCopied("source");
    window.setTimeout(() => setCopied(null), 1200);
  };

  const copyDocument = async () => {
    if (!document) return;
    await navigator.clipboard.writeText(document);
    setCopied("document");
    window.setTimeout(() => setCopied(null), 1200);
  };

  const exportRevision = async () => {
    if (!revision) return;
    setExportError(null);
    try {
      await exportStudioRevisionToFile(revision);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed.");
    }
  };

  const error = response.error?.map((issue) => issue.message).join(" ");
  const status = response.status === "render_error" ? "Render error" : response.status;

  return (
    <section aria-label={`Studio response: ${response.title}`} className="mt-3 min-w-0 overflow-hidden rounded-xl border border-white/[0.09] bg-[#0b0c10] shadow-[0_16px_50px_rgba(0,0,0,0.22)]">
      <header className="flex min-h-11 items-center gap-2 border-b border-white/[0.07] px-2.5">
        <span aria-hidden className={`h-5 w-0.5 rounded-full ${response.status === "rejected" || response.status === "render_error" ? "bg-red-400/70" : "bg-violet-400/80"}`} />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <span className="truncate text-[12px] font-medium text-white/85">{revision?.title ?? response.title}</span>
          {revision && <span className="shrink-0 font-mono text-[10px] text-white/35">r{revision.revision}{hasNewerRevision ? ` / r${response.latestRevision}` : ""}</span>}
          <span aria-live="polite" className="shrink-0 text-[10px] capitalize text-white/35">{status}</span>
          <ChevronDown className={`ml-auto size-3.5 shrink-0 text-white/35 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        </button>
        {revision && (
          <div className="flex items-center gap-0.5">
            <button type="button" className={actionClass} aria-label="Undo Studio revision" title="Undo revision" disabled={!previousRevision} onClick={() => useChatStore.getState().undoStudioResponseRevision(conversationId, assistantMessageId)}><Undo2 className="size-3.5" /></button>
            <div className="relative">
              <button ref={historyButtonRef} type="button" className={actionClass} aria-label="Studio revision history" title="Revision history" aria-haspopup="menu" aria-expanded={historyOpen} onClick={() => setHistoryOpen((value) => !value)}><History className="size-3.5" /></button>
              {historyOpen && (
                <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-white/10 bg-[#111218] p-1 shadow-2xl shadow-black/60">
                  {revisions.map((item) => (
                    <button key={item.revision} type="button" role="menuitem" onClick={() => selectRevision(item.revision)} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] ${item.revision === response.currentRevision ? "bg-violet-500/15 text-violet-100" : "text-white/60 hover:bg-white/[0.05] hover:text-white"}`}>
                      <span className="font-mono text-[10px]">r{item.revision}</span><span className="min-w-0 flex-1 truncate">{item.title}</span>{item.revision === response.latestRevision && <span className="text-[9px] uppercase tracking-wider text-white/30">Latest</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className={actionClass} aria-label="View Studio source" title="View source" onClick={() => setSource((value) => value ? null : "html")}><Code2 className="size-3.5" /></button>
            <button type="button" className={actionClass} aria-label="Copy Studio HTML" title="Copy HTML" onClick={() => void copyDocument()}>{copied === "document" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</button>
            <button type="button" className={actionClass} aria-label="Export Studio response" title="Export HTML" onClick={() => void exportRevision()}><Download className="size-3.5" /></button>
          </div>
        )}
      </header>

      {!collapsed && (
        <div className="relative h-[clamp(420px,68vh,820px)] min-h-0 overflow-hidden">
          {hasNewerRevision && revision && (
            <div className="absolute left-3 right-3 top-3 z-10 flex items-center justify-between rounded-lg border border-violet-400/20 bg-[#111218]/95 px-3 py-2 text-[11px] text-violet-100 shadow-lg backdrop-blur">
              <span>A newer revision is ready.</span>
              <button type="button" className="rounded-md bg-violet-400/15 px-2.5 py-1 text-violet-100 hover:bg-violet-400/25" onClick={() => selectRevision(response.latestRevision)}>View latest</button>
            </div>
          )}
          {source && revision ? (
            <div className="flex h-full flex-col">
              <div className="flex h-10 items-center gap-1 border-b border-white/[0.07] px-2.5">
                {(["html", "css"] as const).map((kind) => <button key={kind} type="button" onClick={() => setSource(kind)} className={`rounded px-2 py-1 font-mono text-[10px] uppercase ${source === kind ? "bg-violet-400/15 text-violet-100" : "text-white/40 hover:text-white"}`}>{kind}</button>)}
                <span className="ml-auto font-mono text-[10px] text-white/30">{new TextEncoder().encode(revision[source]).byteLength.toLocaleString()} bytes</span>
                <button type="button" className={actionClass} aria-label={`Copy ${source.toUpperCase()} source`} onClick={() => void copySource()}>{copied === "source" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</button>
              </div>
              <textarea readOnly spellCheck={false} value={revision[source]} aria-label={`${source.toUpperCase()} source`} className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-[11px] leading-relaxed text-white/65 outline-none" />
            </div>
          ) : revision ? (
            <iframe key={frameKey} title={revision.title} sandbox="" allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; display-capture 'none'; fullscreen 'none'; payment 'none'; usb 'none'; serial 'none'; bluetooth 'none'" referrerPolicy="no-referrer" srcDoc={document} className="absolute inset-0 block size-full border-0 bg-transparent" />
          ) : (
            <div className="grid size-full place-items-center px-6 text-center" aria-live="polite">
              <div><div className="mx-auto mb-3 h-px w-16 bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" /><p className="text-sm text-white/75">{response.status === "rejected" ? "Visual response rejected" : "Creating visual response"}</p>{error && <p className="mt-2 max-w-md text-xs leading-relaxed text-red-200/70">{error}</p>}</div>
            </div>
          )}
          {response.status === "validating" && revision && <div aria-live="polite" className="absolute right-3 top-3 rounded-full border border-violet-400/20 bg-[#111218]/90 px-2.5 py-1 text-[10px] text-violet-100">Validating next revision…</div>}
          {(response.status === "rejected" || response.status === "render_error") && revision && <div aria-live="polite" className="absolute bottom-3 left-3 right-3 flex items-center gap-3 rounded-lg border border-red-400/20 bg-[#111218]/95 px-3 py-2 text-[11px] text-red-100"><span className="min-w-0 flex-1 truncate">{error ?? "The latest render could not be displayed."}</span>{response.status === "render_error" && <button type="button" className="shrink-0 rounded p-1 hover:bg-white/5" onClick={() => setFrameKey((value) => value + 1)} aria-label="Reload Studio response"><RefreshCw className="size-3.5" /></button>}</div>}
          {exportError && <div role="alert" className="absolute bottom-3 left-3 right-3 rounded-lg border border-red-400/20 bg-[#111218]/95 px-3 py-2 text-[11px] text-red-100">{exportError}</div>}
        </div>
      )}
    </section>
  );
}
