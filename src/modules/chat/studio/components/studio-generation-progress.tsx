import { useEffect, useRef, useState } from "react";
import { Brain, Check, ChevronDown, Clock3, Loader2, MessageSquare, Sparkles, TerminalSquare, TriangleAlert } from "lucide-react";
import type { ChatMessage } from "@/modules/chat/chat-types";
import { studioProgressLabel } from "../studio-progress";

const phases = { pending: "Preparing", running: "Running", retrying: "Retrying", done: "Done", error: "Failed" };

export function StudioGenerationProgress({ message, compact, onConversation }: {
  message?: ChatMessage;
  compact: boolean;
  onConversation: () => void;
}) {
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);
  const expanded = userExpanded ?? !compact;
  const [elapsed, setElapsed] = useState(0);
  const reasoningRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const reasoning = message?.reasoning?.trim();
  const tools = message?.toolStates ?? [];
  const progress = studioProgressLabel(message);
  const needsAnswer = tools.some((tool) => (tool.name === "ask_question" || tool.mcpApproval) && (tool.phase === "running" || tool.phase === "pending"));

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const el = reasoningRef.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [reasoning, expanded]);

  return <section aria-label="Studio generation progress" className="w-full overflow-hidden rounded-2xl border border-violet-300/15 bg-[var(--color-panel)] shadow-[0_12px_48px_rgba(0,0,0,0.18)]">
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-violet-300/10 bg-violet-400/[0.08]"><Sparkles size={17} className="text-violet-300" /></span>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Studio activity</p>
        <p role="status" className="flex items-center gap-2 text-sm text-zinc-200"><Loader2 size={13} className="shrink-0 animate-spin text-violet-300 motion-reduce:animate-none" /><span>{progress}</span></p>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums text-zinc-500" title="Time since this progress card appeared"><Clock3 size={12} />{elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`}</span>
      <button type="button" aria-label={expanded ? "Collapse Studio activity" : "Expand Studio activity"} aria-expanded={expanded} onClick={() => setUserExpanded(!expanded)} className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"><ChevronDown size={15} className={`transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} /></button>
    </div>
    {expanded && <div className="max-h-[min(40vh,320px)] overflow-y-auto border-t border-white/[0.06] px-4 py-3">
      {!reasoning && !tools.length && <p className="text-xs leading-6 text-zinc-400">{message?.content.trim() ? "The response is arriving. Studio will open a view here if one is created." : "Your request is in progress. Model activity and tool steps will appear here as they arrive."}</p>}
      {reasoning && <div className="mb-3 rounded-lg border border-violet-300/10 bg-violet-400/[0.03] p-3">
        <p className="mb-2 flex items-center gap-2 text-[11px] font-medium text-violet-300/80"><Brain size={13} />Model reasoning</p>
        <div ref={reasoningRef} onScroll={() => { const el = reasoningRef.current; if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }} className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-6 text-zinc-400">{reasoning}</div>
      </div>}
      {tools.length > 0 && <ol className="space-y-2" aria-label="Studio tool activity">{tools.map((tool) => <li key={tool.id} className="flex items-start gap-2.5 text-xs">
        {tool.phase === "done" ? <Check size={13} className="mt-1 shrink-0 text-emerald-300/70" /> : tool.phase === "error" ? <TriangleAlert size={13} className="mt-1 shrink-0 text-amber-300/80" /> : <TerminalSquare size={13} className="mt-1 shrink-0 text-violet-300/70" />}
        <div className="min-w-0 flex-1"><p className="leading-5 text-zinc-300">{tool.label}</p>{(tool.error || tool.detail) && <p className={`whitespace-pre-wrap break-words text-[11px] leading-5 ${tool.error ? "text-amber-200/80" : "text-zinc-500"}`}>{tool.error || tool.detail}</p>}</div>
        <span className="pt-0.5 text-[10px] text-zinc-500">{phases[tool.phase]}</span>
      </li>)}</ol>}
    </div>}
    <button type="button" onClick={onConversation} className={`flex min-h-9 w-full items-center justify-center gap-2 border-t border-white/[0.06] px-4 text-xs hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-300 ${needsAnswer ? "text-violet-200" : "text-zinc-400"}`}><MessageSquare size={13} />{needsAnswer ? "Open conversation to continue" : "Open conversation"}</button>
  </section>;
}
