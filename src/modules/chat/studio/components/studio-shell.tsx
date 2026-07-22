import { useMemo, useState } from "react";
import { Check, Code2, Copy, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import type { StudioArtifact } from "../studio-types";
import { buildStudioDocument } from "../studio-document-builder";

export function StudioShell({ artifact, generating, onClose }: { artifact?: StudioArtifact; generating: boolean; onClose: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [source, setSource] = useState<"html" | "css" | null>(null);
  const [copied, setCopied] = useState<"html" | "css" | null>(null);
  const revision = artifact?.revisions.find((item) => item.revision === artifact.currentRevision);
  const document = useMemo(() => revision ? buildStudioDocument({ ...revision, reducedMotion: true }) : "", [revision]);
  const copy = async (kind: "html" | "css") => {
    if (!revision) return;
    await navigator.clipboard.writeText(revision[kind]);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1200);
  };
  return <section aria-label="Studio" className={`${fullscreen ? "absolute inset-0 z-40" : "relative min-w-[320px] flex-[1.35]"} flex min-h-0 flex-col overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-panel)]`}>
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-3">
      <span className="font-mono text-[10px] uppercase tracking-[.16em] text-violet-300">Studio</span>
      <span className="min-w-0 flex-1 truncate text-xs text-white/80">{revision?.title ?? "Visual canvas"}{revision ? ` · r${revision.revision}` : ""}</span>
      <span aria-live="polite" className="text-[10px] text-[var(--color-text-dim)]">{generating ? "Generating…" : revision ? "Ready" : "Empty"}</span>
      {revision && <button title="View source" aria-label="View source" onClick={() => setSource(source ? null : "html")} className="rounded p-1.5 text-white/55 hover:bg-white/5 hover:text-white"><Code2 className="size-3.5" /></button>}
      <button title={collapsed ? "Expand Studio" : "Collapse Studio"} aria-label={collapsed ? "Expand Studio" : "Collapse Studio"} onClick={() => setCollapsed(!collapsed)} className="rounded p-1.5 text-white/55 hover:bg-white/5 hover:text-white">{collapsed ? <PanelRightOpen className="size-3.5" /> : <PanelRightClose className="size-3.5" />}</button>
      <button title={fullscreen ? "Exit fullscreen" : "Fullscreen"} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={() => setFullscreen(!fullscreen)} className="rounded p-1.5 text-white/55 hover:bg-white/5 hover:text-white">{fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}</button>
      <button title="Close Studio" aria-label="Close Studio" onClick={onClose} className="rounded p-1.5 text-white/55 hover:bg-white/5 hover:text-white"><X className="size-3.5" /></button>
    </header>
    {!collapsed && <div className="relative min-h-0 flex-1 overflow-hidden">
      {source && revision ? <div className="flex h-full flex-col">
        <div className="flex items-center gap-1 border-b border-[var(--color-border)] p-2">
          {(["html", "css"] as const).map((kind) => <button key={kind} onClick={() => setSource(kind)} className={`rounded px-2 py-1 text-[11px] uppercase ${source === kind ? "bg-violet-500/15 text-violet-200" : "text-white/50"}`}>{kind}</button>)}
          <span className="ml-auto text-[10px] text-white/35">{new TextEncoder().encode(revision[source]).byteLength.toLocaleString()} bytes</span>
          <button onClick={() => void copy(source)} className="rounded p-1.5 text-white/55 hover:bg-white/5" aria-label={`Copy ${source.toUpperCase()}`}>{copied === source ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</button>
        </div>
        <textarea readOnly spellCheck={false} value={revision[source]} aria-label={`${source.toUpperCase()} source`} className="min-h-0 flex-1 resize-none bg-[#0b0c10] p-4 font-mono text-[11px] leading-relaxed text-white/70 outline-none" />
      </div> : revision ? <iframe title={revision.title} sandbox="" allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; display-capture 'none'; fullscreen 'none'; payment 'none'; usb 'none'; serial 'none'; bluetooth 'none'" referrerPolicy="no-referrer" srcDoc={document} className="h-full w-full border-0 bg-white" /> : <div className="grid h-full place-items-center p-8 text-center"><div><p className="text-sm font-medium text-white/80">Studio is ready</p><p className="mt-2 max-w-xs text-xs leading-relaxed text-white/40">Ask for a dashboard, timeline, comparison, planner, or another visual response.</p></div></div>}
      {generating && revision && <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-violet-400/20 bg-[#111218]/90 px-2.5 py-1 text-[10px] text-violet-200 shadow-lg">Creating next view…</div>}
    </div>}
  </section>;
}

