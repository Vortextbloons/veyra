import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Clock3, Code2, Copy, Download, History, Loader2, X } from "lucide-react";
import type { ChatMessage } from "@/modules/chat/chat-types";
import type { StudioScene, StudioWorkspace } from "../studio-types";
import { getCachedStudioDocument } from "../studio-document-cache";
import { exportStudioRevisionToFile } from "../studio-export";

type Props = {
  messages: ChatMessage[];
  workspace?: StudioWorkspace;
  isStreaming: boolean;
  streamingMessageId: string | null;
  streamingContent?: string;
  onSelectScene: (sceneId: string) => void;
  onRegenerate?: (messageId: string) => void;
};

const FRAME_POLICY = "clipboard-read 'none'; clipboard-write 'none'; camera 'none'; microphone 'none'; geolocation 'none'; fullscreen 'none'";

function sceneDocument(workspaceId: string, scene: StudioScene, reducedMotion: boolean) {
  return getCachedStudioDocument({ artifactId: `${workspaceId}:${scene.id}`, revision: scene.revision, title: scene.title, html: scene.html, css: scene.css, reducedMotion });
}

function StudioStage({ workspace, scene }: { workspace: StudioWorkspace; scene: StudioScene }) {
  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [frames, setFrames] = useState<[StudioScene | undefined, StudioScene | undefined]>([scene, undefined]);
  const [activeIndex, setActiveIndex] = useState<0 | 1>(0);
  const activeScene = frames[activeIndex];

  useEffect(() => {
    if (activeScene?.id === scene.id || frames[1 - activeIndex]?.id === scene.id) return;
    const stagingIndex = (1 - activeIndex) as 0 | 1;
    setFrames((current) => {
      const next: [StudioScene | undefined, StudioScene | undefined] = [...current];
      next[stagingIndex] = scene;
      return next;
    });
  }, [activeIndex, activeScene?.id, frames, scene]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-[#090a0f]">
      {frames.map((frame, index) => frame && <iframe
        key={frame.id}
        title={frame.title}
        srcDoc={sceneDocument(workspace.id, frame, reducedMotion)}
        sandbox=""
        referrerPolicy="no-referrer"
        allow={FRAME_POLICY}
        aria-hidden={index !== activeIndex}
        tabIndex={index === activeIndex ? 0 : -1}
        onLoad={() => {
          if (frame.id !== scene.id || index === activeIndex) return;
          setActiveIndex(index as 0 | 1);
        }}
        className={`absolute inset-0 h-full w-full border-0 bg-[#0b0c12] ${index === activeIndex ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"} ${reducedMotion ? "" : "transition-opacity duration-200"}`}
      />)}
    </div>
  );
}

export function StudioWorkspacePresenter({ messages, workspace, isStreaming, streamingMessageId, streamingContent, onSelectScene, onRegenerate }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const scenes = workspace?.scenes ?? [];
  const selectedIndex = Math.max(0, scenes.findIndex((scene) => scene.id === workspace?.currentSceneId));
  const selected = scenes[selectedIndex];
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const latestPrompt = [...messages].reverse().find((message) => message.role === "user");
  const narrative = streamingMessageId ? streamingContent : latestAssistant?.content;
  const working = isStreaming || workspace?.status === "generating" || workspace?.status === "validating";

  const copySource = async () => {
    if (selected) await navigator.clipboard.writeText(`<!-- ${selected.title} -->\n${selected.html}\n\n<style>\n${selected.css}\n</style>`);
  };

  return (
    <section aria-label="Studio workspace" className="relative flex min-h-0 flex-1 overflow-hidden bg-[#08090d]">
      <div className="relative flex min-w-0 flex-1 flex-col p-2.5 sm:p-3">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[14px] border border-white/10 bg-[#0b0c12] shadow-[0_24px_70px_rgba(0,0,0,0.38)]">
          {selected && workspace ? <StudioStage workspace={workspace} scene={selected} /> : <StudioEmptyState />}

          <nav aria-label="Scene navigation" className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-white/10 bg-[#101118]/90 p-1 shadow-lg backdrop-blur-xl">
            <button type="button" aria-label="Previous scene" disabled={selectedIndex <= 0} onClick={() => onSelectScene(scenes[selectedIndex - 1]!.id)} className="rounded-md p-1.5 text-zinc-300 hover:bg-white/10 disabled:opacity-30"><ArrowLeft size={15} /></button>
            <button type="button" aria-label="Next scene" disabled={!selected || selectedIndex >= scenes.length - 1} onClick={() => onSelectScene(scenes[selectedIndex + 1]!.id)} className="rounded-md p-1.5 text-zinc-300 hover:bg-white/10 disabled:opacity-30"><ArrowRight size={15} /></button>
            <span className="min-w-12 px-1 text-center font-mono text-[10px] text-zinc-400">{selected ? `${selectedIndex + 1}/${scenes.length}` : "0/0"}</span>
            <button type="button" aria-label="Open scene history" onClick={() => setHistoryOpen((value) => !value)} className="rounded-md p-1.5 text-violet-200 hover:bg-violet-400/10"><History size={15} /></button>
          </nav>

          {selected && <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-white/10 bg-[#101118]/90 p-1 shadow-lg backdrop-blur-xl">
            <button type="button" aria-label="View scene source" onClick={() => setSourceOpen(true)} className="rounded-md p-1.5 text-zinc-300 hover:bg-white/10"><Code2 size={15} /></button>
            <button type="button" aria-label="Copy scene source" onClick={() => void copySource()} className="rounded-md p-1.5 text-zinc-300 hover:bg-white/10"><Copy size={15} /></button>
            <button type="button" aria-label="Export scene" onClick={() => void exportStudioRevisionToFile(selected)} className="rounded-md p-1.5 text-zinc-300 hover:bg-white/10"><Download size={15} /></button>
          </div>}

          {(working || workspace?.error?.length) && <div role="status" aria-live="polite" className="absolute inset-x-3 bottom-3 z-20 flex items-center gap-2 rounded-lg border border-violet-300/15 bg-[#11121a]/92 px-3 py-2 text-xs text-zinc-200 shadow-xl backdrop-blur-xl">
            {working ? <><Loader2 size={14} className="animate-spin text-violet-300" /><span>{workspace?.status === "validating" ? "Checking the next scene…" : "Composing the workspace…"}</span></> : <><span className="h-1.5 w-1.5 rounded-full bg-amber-300" /><span>{workspace?.error?.[0]?.message}</span></>}
          </div>}

          {!working && selected?.caption && <div className="absolute inset-x-0 bottom-3 z-10 mx-auto max-w-xl px-3"><p className="rounded-lg border border-white/10 bg-[#11121a]/88 px-3 py-2 text-center text-xs text-zinc-300 shadow-lg backdrop-blur-xl">{selected.caption}</p></div>}
          {!selected && narrative?.trim() && <div className="absolute inset-x-0 bottom-6 z-10 mx-auto max-w-2xl px-6"><div className="rounded-xl border border-white/10 bg-[#11121a]/95 p-5 text-sm leading-6 text-zinc-200 shadow-xl">{narrative}</div></div>}
        </div>
        {latestPrompt && <div aria-label="Latest prompt" className="mx-auto mt-2 flex max-w-[80%] items-center gap-2 text-[11px] text-zinc-500"><span className="h-px w-5 bg-violet-400/40" /><span className="truncate">{latestPrompt.content}</span></div>}
      </div>

      {historyOpen && <aside aria-label="Scene history" className="absolute inset-y-2.5 right-2.5 z-30 flex w-[min(340px,calc(100%-20px))] flex-col rounded-xl border border-white/10 bg-[#0d0e14]/98 shadow-2xl backdrop-blur-xl">
        <div className="flex h-12 items-center justify-between border-b border-white/8 px-3"><div><p className="text-xs font-medium text-zinc-100">Scene history</p><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-violet-300/70">Studio chronology</p></div><button type="button" aria-label="Close history" onClick={() => setHistoryOpen(false)} className="rounded-md p-1.5 text-zinc-400 hover:bg-white/10"><X size={15} /></button></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">{scenes.map((scene, index) => <button key={scene.id} type="button" onClick={() => { onSelectScene(scene.id); setHistoryOpen(false); }} className={`mb-1 w-full rounded-lg border px-3 py-2.5 text-left ${scene.id === selected?.id ? "border-violet-400/30 bg-violet-400/10" : "border-transparent hover:border-white/8 hover:bg-white/[0.035]"}`}><div className="flex items-center justify-between gap-3"><span className="truncate text-xs font-medium text-zinc-200">{scene.title}</span><span className="font-mono text-[9px] text-zinc-600">{String(index + 1).padStart(2, "0")}</span></div><div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500"><Clock3 size={10} /><time>{new Date(scene.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>{scene.id === workspace?.latestSceneId && <span className="ml-auto text-violet-300">Latest</span>}</div></button>)}</div>
        {selected && onRegenerate && <div className="border-t border-white/8 p-2"><button type="button" onClick={() => onRegenerate(selected.assistantMessageId)} className="w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5">Regenerate selected scene</button></div>}
      </aside>}

      {sourceOpen && selected && <div role="dialog" aria-modal="true" aria-label="Scene source" className="absolute inset-3 z-40 flex flex-col overflow-hidden rounded-xl border border-white/12 bg-[#090a0f]/98 shadow-2xl"><div className="flex h-11 items-center justify-between border-b border-white/8 px-3"><span className="truncate text-xs text-zinc-200">Source · {selected.title}</span><button type="button" aria-label="Close source" onClick={() => setSourceOpen(false)} className="rounded-md p-1.5 text-zinc-400 hover:bg-white/10"><X size={15} /></button></div><pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-[11px] leading-5 text-zinc-300"><code>{`<!-- HTML -->\n${selected.html}\n\n/* CSS */\n${selected.css}`}</code></pre></div>}
      <span aria-live="polite" className="sr-only">{selected ? `Scene ${selected.title} selected` : "Studio workspace is empty"}</span>
    </section>
  );
}

function StudioEmptyState() {
  return <div className="flex h-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_35%,rgba(126,100,190,0.11),transparent_38%),linear-gradient(145deg,#0c0d13,#08090d)] px-8"><div className="max-w-xl text-center"><p className="font-mono text-[10px] uppercase tracking-[0.22em] text-violet-300/70">Dynamic workspace</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-zinc-100">What should we build or explore?</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">Describe a dashboard, plan, comparison, explainer, or visual environment. Each response can reshape this entire stage.</p><div className="mx-auto mt-8 h-px w-32 bg-gradient-to-r from-transparent via-violet-400/50 to-transparent" /></div></div>;
}
