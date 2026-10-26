import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import {
  ChevronDown,
  Clipboard,
  Download,
  FileCode2,
  FileText,
  Maximize2,
  Minimize2,
  Pencil,
  Printer,
  Save,
  X,
} from "lucide-react";
import { DialogSurface } from "@/components/dialog-surface";
import { HighlightedCode } from "@/components/ui/highlighted-code";
import {
  artifactDownloadName,
  artifactByteLength,
  formatArtifactSize,
  type Artifact,
} from "@/modules/chat/artifact";
import { useChatStore } from "@/stores/chat-store";

const MarkdownRenderer = lazy(() =>
  import("@/components/markdown-renderer").then((module) => ({ default: module.MarkdownRenderer })),
);
type ArtifactBlockProps = {
  artifact: Artifact;
  messageId: string;
};

export function ArtifactBlock({ artifact, messageId }: ArtifactBlockProps) {
  const [expanded, setExpanded] = useState(true);
  const [fullScreen, setFullScreen] = useState(false);
  const [source, setSource] = useState(false);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(artifact.title);
  const [contentDraft, setContentDraft] = useState(artifact.content);
  const [status, setStatus] = useState("");
  const [printSource, setPrintSource] = useState<string | null>(null);
  const printFrame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!printSource) return;
    const frame = printFrame.current;
    if (!frame) return;
    const onLoad = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => setPrintSource(null), 500);
    };
    frame.addEventListener("load", onLoad, { once: true });
    return () => frame.removeEventListener("load", onLoad);
  }, [printSource]);

  const copyArtifact = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setStatus("Source copied");
    } catch {
      setStatus("Clipboard access is unavailable");
    }
  };

  const downloadArtifact = () => {
    const mime = artifact.format === "html"
      ? "text/html;charset=utf-8"
      : artifact.format === "document"
        ? "text/markdown;charset=utf-8"
        : "text/plain;charset=utf-8";
    const url = URL.createObjectURL(new Blob([artifact.content], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = artifactDownloadName(artifact);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const saveDocument = () => {
    const saved = useChatStore.getState().updateAssistantDocument(messageId, titleDraft, contentDraft);
    setStatus(saved ? "Document saved" : "The document could not be saved. Check its title and 256 KB size limit.");
    if (saved) setEditing(false);
  };

  const cancelEdit = () => {
    setTitleDraft(artifact.title);
    setContentDraft(artifact.content);
    setEditing(false);
    setStatus("");
  };

  const print = () => setPrintSource(createPrintDocument(artifact));

  const panelProps = {
    artifact,
    expanded: fullScreen || expanded,
    fullScreen,
    editing,
    source,
    titleDraft,
    contentDraft,
    status,
    onCollapse: () => setExpanded((value) => !value),
    onFullScreen: () => setFullScreen((value) => !value),
    onSource: () => setSource((value) => !value),
    onEdit: () => { setStatus(""); setEditing(true); },
    onCancelEdit: cancelEdit,
    onTitleChange: setTitleDraft,
    onContentChange: setContentDraft,
    onSave: saveDocument,
    onCopy: copyArtifact,
    onDownload: downloadArtifact,
    onPrint: print,
  };

  return (
    <>
      <ArtifactPanel {...panelProps} />
      <DialogSurface
        open={fullScreen}
        onClose={() => setFullScreen(false)}
        ariaLabel={`${artifact.title} full-screen artifact`}
        panelClassName="flex h-[94vh] w-[min(1280px,96vw)] max-w-[96vw] flex-col overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] shadow-2xl"
      >
        <ArtifactPanel {...panelProps} />
      </DialogSurface>
      {printSource && (
        <iframe
          ref={printFrame}
          title="Print artifact"
          srcDoc={printSource}
          sandbox="allow-modals"
          referrerPolicy="no-referrer"
          className="pointer-events-none fixed left-[-10000px] top-0 h-px w-px opacity-0"
        />
      )}
      <span className="sr-only" role="status">{status}</span>
    </>
  );
}

type ArtifactPanelProps = {
  artifact: Artifact;
  expanded: boolean;
  fullScreen: boolean;
  editing: boolean;
  source: boolean;
  titleDraft: string;
  contentDraft: string;
  status: string;
  onCollapse: () => void;
  onFullScreen: () => void;
  onSource: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSave: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onPrint: () => void;
};

function ArtifactPanel({
  artifact,
  expanded,
  fullScreen,
  editing,
  source,
  titleDraft,
  contentDraft,
  status,
  onCollapse,
  onFullScreen,
  onSource,
  onEdit,
  onCancelEdit,
  onTitleChange,
  onContentChange,
  onSave,
  onCopy,
  onDownload,
  onPrint,
}: ArtifactPanelProps) {
  const icon = artifact.format === "code" ? <FileCode2 className="size-4" /> : <FileText className="size-4" />;
  const typeLabel = artifact.format === "html" ? "HTML document" : artifact.format === "document" ? "Markdown document" : `${artifact.language || "Code"} file`;

  return (
    <section className={`overflow-hidden border border-white/[0.09] bg-[#111] ${fullScreen ? "flex min-h-0 flex-1 flex-col rounded-lg" : "my-2 rounded-xl"}`}>
      <header className="flex min-h-14 items-center gap-3 border-b border-white/[0.08] px-3 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--color-accent)]/15 text-[var(--color-focus)]">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-white">{artifact.title}</div>
          <div className="mt-0.5 text-[10px] text-[var(--color-text-dim)]">{typeLabel} <span className="px-1">·</span> {formatArtifactSize(artifactByteLength(artifact.content))}</div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {artifact.format === "html" && (
            <button type="button" onClick={onSource} className={actionClass} title={source ? "Show preview" : "Show source"} aria-label={source ? "Show HTML preview" : "Show HTML source"}>
              <span className="px-1 text-[10px] font-medium">{source ? "Preview" : "Source"}</span>
            </button>
          )}
          {artifact.format === "document" && !editing && (
            <IconButton label="Edit document" onClick={onEdit}><Pencil className="size-3.5" /></IconButton>
          )}
          {editing ? (
            <>
              <IconButton label="Save document" onClick={onSave}><Save className="size-3.5" /></IconButton>
              <IconButton label="Cancel document edits" onClick={onCancelEdit}><X className="size-3.5" /></IconButton>
            </>
          ) : (
            <>
              <IconButton label="Copy artifact source" onClick={onCopy}><Clipboard className="size-3.5" /></IconButton>
              <IconButton label="Download artifact" onClick={onDownload}><Download className="size-3.5" /></IconButton>
              {artifact.format === "html" && <IconButton label="Print artifact" onClick={onPrint}><Printer className="size-3.5" /></IconButton>}
              <IconButton label={fullScreen ? "Close full-screen view" : "Open full-screen view"} onClick={onFullScreen}>{fullScreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}</IconButton>
              {!fullScreen && <IconButton label={expanded ? "Collapse artifact" : "Expand artifact"} onClick={onCollapse}><ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} /></IconButton>}
            </>
          )}
        </div>
      </header>
      {expanded && (
        <div className={`min-h-0 ${fullScreen ? "flex-1 p-3" : "p-2.5"}`}>
          {artifact.format === "html" && !editing && (
            <p className="mb-2 text-[10px] text-[var(--color-text-dim)]">Downloaded HTML is outside Veyra’s preview sandbox.</p>
          )}
          {editing ? (
            <div className="flex h-full min-h-[360px] flex-col gap-2">
              <label className="text-[10px] font-medium text-[var(--color-text-dim)]">
                Title
                <input value={titleDraft} onChange={(event) => onTitleChange(event.target.value)} maxLength={120} className="mt-1 block w-full rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[12px] text-white" />
              </label>
              <label className="flex min-h-0 flex-1 flex-col text-[10px] font-medium text-[var(--color-text-dim)]">
                Markdown
                <textarea value={contentDraft} onChange={(event) => onContentChange(event.target.value)} spellCheck className="mt-1 min-h-[300px] flex-1 resize-y rounded-md border border-white/10 bg-black/20 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-white" />
              </label>
              {status && <p className="text-[11px] text-[var(--color-text-dim)]">{status}</p>}
            </div>
          ) : artifact.format === "html" ? (
            source ? <Suspense fallback={<ArtifactLoading />}><HighlightedCode code={artifact.content} language="html" /></Suspense> : <HtmlArtifactPreview artifact={artifact} />
          ) : artifact.format === "document" ? (
            <div className={`overflow-y-auto rounded-md bg-[#171717] px-5 py-4 ${fullScreen ? "h-full" : "max-h-[520px]"}`}>
              <Suspense fallback={<ArtifactLoading />}><MarkdownRenderer className="artifact-document-preview leading-relaxed">{artifact.content}</MarkdownRenderer></Suspense>
            </div>
          ) : (
            <Suspense fallback={<ArtifactLoading />}><HighlightedCode code={artifact.content} language={artifact.language || "plaintext"} /></Suspense>
          )}
          {!editing && status && <div className="mt-2 text-[10px] text-[var(--color-text-dim)]" role="status">{status}</div>}
        </div>
      )}
    </section>
  );
}

const actionClass = "inline-flex h-7 items-center rounded-md border border-white/10 px-1.5 text-[var(--color-text-dim)] transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white";

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={`${actionClass} justify-center px-2`}>{children}</button>;
}

function HtmlArtifactPreview({ artifact }: { artifact: Artifact }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!isTauri()) {
      return () => { active = false; };
    }
    void invoke("register_artifact_preview", { id: artifact.id, html: withoutMetaRefresh(artifact.content) })
      .then(() => {
        if (active) setPreviewUrl(convertFileSrc(artifact.id, "artifact-preview"));
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "The preview could not be loaded.");
      });
    return () => { active = false; };
  }, [artifact.content, artifact.id]);

  if (error) return <div className="grid min-h-[260px] place-items-center rounded-md border border-white/10 bg-black/20 p-5 text-center text-[12px] text-[var(--color-text-dim)]">Preview unavailable: {error}</div>;

  return (
    <div className="overflow-hidden rounded-md border border-white/10 bg-white">
      {isTauri() && !previewUrl ? (
        <div className="grid min-h-[260px] place-items-center text-[12px] text-neutral-500">Preparing secure preview…</div>
      ) : (
        <iframe
          title={artifact.title}
          src={previewUrl ?? undefined}
          srcDoc={!isTauri() ? withPreviewPolicy(artifact.content) : undefined}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          loading="lazy"
          className="block h-[min(62vh,520px)] min-h-[280px] w-full bg-white"
        />
      )}
    </div>
  );
}

function ArtifactLoading() {
  return <div className="grid min-h-[180px] place-items-center text-[11px] text-[var(--color-text-dim)]">Loading artifact view…</div>;
}

function withPreviewPolicy(html: string): string {
  const previewHtml = withoutMetaRefresh(html);
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'">`;
  return /<head(?:\s[^>]*)?>/i.test(previewHtml)
    ? previewHtml.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${policy}`)
    : `<!doctype html><html><head>${policy}</head><body>${previewHtml}</body></html>`;
}

function withoutMetaRefresh(html: string): string {
  return html.replace(/<meta\b(?=[^>]*\bhttp-equiv\s*=\s*["']?refresh\b)[^>]*>/gi, "");
}

function createPrintDocument(artifact: Artifact): string {
  const safeHtml = artifact.format === "html"
    ? artifact.content
    : `<pre>${escapeHtml(artifact.content)}</pre>`;
  const printStyles = `<style>@media print{body{margin:0!important;background:#fff!important;color:#111!important}}body{background:#fff;color:#111}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11pt/1.55 ui-monospace,monospace}img,svg{max-width:100%}</style>`;
  if (/<head(?:\s[^>]*)?>/i.test(safeHtml)) {
    return safeHtml.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; sandbox">${printStyles}`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; sandbox"><title>${escapeHtml(artifact.title)}</title>${printStyles}</head><body>${safeHtml}</body></html>`;
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}
