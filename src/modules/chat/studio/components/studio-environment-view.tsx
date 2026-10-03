import { lazy, Suspense, useEffect, useEffectEvent, useMemo, useReducer, useRef, useState } from "react";
import { ArrowLeft, Check, Code2, Copy, Download, Ellipsis, History, Loader2, MessageSquare, RotateCcw, X } from "lucide-react";
import type { ChatMessage, Conversation } from "@/modules/chat/chat-types";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";
import { buildStudioDocument } from "../studio-document-builder";
import { exportStudioRevisionToFile } from "../studio-export";
import { parseStudioBridgeMessage, studioEnvironmentEntries, type StudioEnvironmentEntry } from "../studio-environment";
import type { StudioJsonObject } from "../studio-types";
import { StudioGenerationProgress } from "./studio-generation-progress";
import { studioProgressLabel } from "../studio-progress";

const actionClass = "flex min-h-9 items-center justify-center gap-2 rounded-lg px-2.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-30 disabled:pointer-events-none";
const permissions = "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; display-capture 'none'; fullscreen 'none'; payment 'none'; usb 'none'; serial 'none'; bluetooth 'none'";
const MarkdownRenderer = lazy(() => import("@/components/markdown-renderer").then((module) => ({ default: module.MarkdownRenderer })));

function EnvironmentFrame({ entry, conversationId, active, reducedMotion, onReady, onError }: {
  entry: StudioEnvironmentEntry;
  conversationId: string;
  active: boolean;
  reducedMotion: boolean;
  onReady: (entry: StudioEnvironmentEntry) => void;
  onError: (entry: StudioEnvironmentEntry, message: string) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const channel = useMemo(() => crypto.randomUUID(), []);
  const document = useMemo(() => buildStudioDocument({ ...entry.revision, reducedMotion, channel }), [entry.revision, reducedMotion, channel]);
  const reportReady = useEffectEvent(() => onReady(entry));
  const reportError = useEffectEvent((message: string) => onError(entry, message));
  const canPersist = useEffectEvent(() => active);

  useEffect(() => {
    let ready = false;
    let failed = false;
    let pendingState: StudioJsonObject | undefined;
    const origin = { messageId: entry.messageId, revision: entry.revision.revision };
    const update = (patch: Parameters<ReturnType<typeof useChatStore.getState>["updateStudioEnvironment"]>[2]) =>
      useChatStore.getState().updateStudioEnvironment(conversationId, origin, patch);
    const fail = (message: string) => {
      if (failed) return;
      failed = true;
      update({ feedback: { ...origin, status: "error", message } });
      reportError(message);
    };
    const timer = window.setTimeout(() => { if (!ready) fail("This view did not become ready. You can retry or ask Studio to repair it."); }, 6000);
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.channel !== channel) return;
      const message = parseStudioBridgeMessage(event.data);
      if (!message || failed) return;
      if (message.type === "connect") {
        const conversation = useChatStore.getState().conversations.find((item) => item.id === conversationId);
        frameRef.current?.contentWindow?.postMessage({ channel, type: "initialize", state: conversation?.studioEnvironment?.state ?? {} }, "*");
      } else if (message.type === "ready") {
        if (ready) return;
        ready = true;
        clearTimeout(timer);
        update({ feedback: { ...origin, status: "ready" }, ...(pendingState ? { state: pendingState } : {}) });
        reportReady();
      } else if (message.type === "error") fail(message.message);
      else if (message.type === "state") {
        pendingState = message.state;
        if (ready && canPersist()) update({ state: message.state });
      } else if (message.type === "event" && ready && canPersist()) update({ lastEvent: { name: message.name, payload: message.payload } });
    };
    window.addEventListener("message", receive);
    return () => { clearTimeout(timer); window.removeEventListener("message", receive); };
  }, [channel, conversationId, entry.messageId, entry.revision.revision, document]);

  return <iframe ref={frameRef} title={entry.revision.title} srcDoc={document} sandbox="allow-scripts" allow={permissions} referrerPolicy="no-referrer" aria-hidden={!active} tabIndex={active ? 0 : -1} inert={!active} className={`absolute inset-0 size-full border-0 bg-transparent ${active ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"} ${reducedMotion ? "" : "transition-opacity duration-200"}`} />;
}

type StageState = { displayed?: StudioEnvironmentEntry; previous?: StudioEnvironmentEntry; errors: Record<string, string>; reload: number };
type StageAction = { type: "ready"; entry: StudioEnvironmentEntry } | { type: "error"; entry: StudioEnvironmentEntry; message: string } | { type: "retry" };
function stageReducer(state: StageState, action: StageAction): StageState {
  if (action.type === "retry") return { ...state, errors: {}, reload: state.reload + 1 };
  if (action.type === "ready") {
    const errors = { ...state.errors }; delete errors[action.entry.key];
    return { ...state, displayed: action.entry, previous: state.displayed?.key !== action.entry.key ? state.displayed : state.previous, errors };
  }
  return { ...state, displayed: state.displayed?.key === action.entry.key ? state.previous : state.displayed, previous: undefined, errors: { ...state.errors, [action.entry.key]: action.message } };
}

function SourceDialog({ entry, close }: { entry: StudioEnvironmentEntry; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} onClose={close} aria-label="Environment source" className="m-auto h-[75vh] w-[min(900px,90vw)] rounded-xl border border-white/15 bg-[#101118] p-0 text-zinc-200 backdrop:bg-black/70">
    <div className="flex items-center justify-between border-b border-white/10 px-4 py-2"><span className="truncate text-sm">{entry.revision.title}</span><button className={actionClass} onClick={() => ref.current?.close()} aria-label="Close source"><X size={16} /></button></div>
    <pre className="h-[calc(100%-52px)] overflow-auto whitespace-pre-wrap p-5 font-mono text-xs leading-6"><code>{`${entry.revision.html}\n\n/* CSS */\n${entry.revision.css}\n\n/* JavaScript */\n${entry.revision.javascript ?? ""}\n\n/* Data */\n${JSON.stringify(entry.revision.data ?? {}, null, 2)}`}</code></pre>
  </dialog>;
}

export function StudioEnvironmentView({ conversation, messages, isStreaming, streamingMessageId, onConversation, conversationOpen, onStop, onRepair, onSuggestion }: {
  conversation?: Conversation;
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  onConversation: () => void;
  conversationOpen: boolean;
  onStop?: () => void;
  onRepair?: (prompt: string) => void;
  onSuggestion: (prompt: string) => void;
}) {
  const [stage, dispatch] = useReducer(stageReducer, { reload: 0, errors: {} });
  const [sourceOpen, setSourceOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [systemReducedMotion, setSystemReducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const presentation = useSettingsStore((state) => state.studioPresentation);
  const reducedMotion = systemReducedMotion || presentation === "calm";
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setSystemReducedMotion(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!actionMessage) return;
    const timer = setTimeout(() => setActionMessage(""), 3000);
    return () => clearTimeout(timer);
  }, [actionMessage]);
  const entries = useMemo(() => studioEnvironmentEntries(messages), [messages]);
  const latest = entries.at(-1);
  const selection = conversation?.studioEnvironment?.selection;
  const selected = entries.find((entry) => entry.messageId === selection?.messageId && entry.revision.revision === selection.revision) ?? latest;
  const displayed = entries.find((entry) => entry.key === stage.displayed?.key);
  const failed = selected ? Boolean(stage.errors[selected.key]) : false;
  const candidate = failed ? entries.slice(0, entries.findIndex((entry) => entry.key === selected?.key)).reverse().find((entry) => !stage.errors[entry.key]) : selected;
  const frames = [displayed, candidate].filter((entry, index, list): entry is StudioEnvironmentEntry => Boolean(entry) && list.findIndex((other) => other?.key === entry?.key) === index);
  const selectedIndex = entries.findIndex((entry) => entry.key === displayed?.key);
  const assistant = [...messages].reverse().find((message) => message.role === "assistant");
  const streaming = messages.find((message) => message.id === streamingMessageId);
  const rejection = assistant?.studioResponse?.status === "rejected" ? assistant.studioResponse.error?.[0]?.message : undefined;
  const progress = studioProgressLabel(streaming);
  const select = (entry?: StudioEnvironmentEntry) => {
    if (conversation) useChatStore.getState().selectStudioEnvironment(conversation.id, entry ? { messageId: entry.messageId, revision: entry.revision.revision } : undefined);
  };
  const copy = async () => {
    if (!displayed) return;
    try { await navigator.clipboard.writeText(buildStudioDocument({ ...displayed.revision, state: conversation?.studioEnvironment?.state, reducedMotion })); setActionMessage("Copied HTML"); }
    catch { setActionMessage("Could not copy. Try exporting the view."); }
  };
  const exportView = async () => {
    if (!displayed) return;
    try { const path = await exportStudioRevisionToFile(displayed.revision, conversation?.studioEnvironment?.state); if (path) setActionMessage("Exported HTML"); }
    catch (error) { setActionMessage(error instanceof Error ? error.message : "Export failed. Try again."); }
  };
  const error = selected && failed ? stage.errors[selected.key] : rejection;
  const undoEntry = entries.slice(0, selectedIndex).reverse().find((entry) => !stage.errors[entry.key]);
  const eventPayload = conversation?.studioEnvironment?.lastEvent?.payload;
  const selectionLabel = eventPayload && typeof eventPayload === "object" && !Array.isArray(eventPayload) && typeof eventPayload.label === "string" ? eventPayload.label : undefined;
  return <section aria-label="Studio environment" className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
    <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-white/[0.06] px-4">
      <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">{displayed?.revision.title ?? "Studio"}</span>
      <button className={actionClass} disabled={!undoEntry} onClick={() => select(undoEntry)} aria-label="Undo environment change" title="Undo"><RotateCcw size={15} /></button>
      <details className="relative">
        <summary className={`${actionClass} list-none cursor-pointer`} aria-label="Environment history"><History size={15} /></summary>
        <div className="absolute right-0 top-full z-40 mt-1 max-h-80 w-72 overflow-auto rounded-xl border border-white/10 bg-[#111218] p-2 shadow-2xl">
          <p className="px-2 py-2 text-[10px] uppercase tracking-widest text-zinc-500">Environment history</p>
          {[...entries].reverse().map((entry) => <button key={entry.key} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-zinc-300 hover:bg-white/5" onClick={(event) => { select(entry); event.currentTarget.closest("details")?.removeAttribute("open"); }}><span className="min-w-0 flex-1 truncate">{entry.revision.title}</span>{entry.key === displayed?.key && <Check size={13} />}</button>)}
          {!entries.length && <p className="px-2 py-3 text-xs text-zinc-500">Your views will appear here.</p>}
        </div>
      </details>
      <details className="relative">
        <summary className={`${actionClass} list-none cursor-pointer`} aria-label="Environment options"><Ellipsis size={15} /></summary>
        <div className="absolute right-0 top-full z-40 mt-1 w-44 rounded-xl border border-white/10 bg-[#111218] p-1 shadow-2xl">
          <button className={`${actionClass} w-full justify-start`} disabled={!displayed} onClick={(event) => { setSourceOpen(true); event.currentTarget.closest("details")?.removeAttribute("open"); }}><Code2 size={14} />View source</button>
          <button className={`${actionClass} w-full justify-start`} disabled={!displayed} onClick={() => void copy()}><Copy size={14} />Copy HTML</button>
          <button className={`${actionClass} w-full justify-start`} disabled={!displayed} onClick={() => void exportView()}><Download size={14} />Export HTML</button>
        </div>
      </details>
      <button className={actionClass} aria-expanded={conversationOpen} aria-controls="studio-conversation" onClick={onConversation}><MessageSquare size={15} /><span className="hidden sm:inline">Conversation</span></button>
    </div>
    <div className="relative min-h-0 flex-1 overflow-hidden">
      {frames.map((entry) => conversation && <EnvironmentFrame key={`${entry.key}:${stage.reload}`} entry={entry} conversationId={conversation.id} active={entry.key === displayed?.key} reducedMotion={reducedMotion} onReady={(ready) => dispatch({ type: "ready", entry: ready })} onError={(broken, message) => dispatch({ type: "error", entry: broken, message })} />)}
      {isStreaming && <div className={displayed ? "absolute inset-x-4 bottom-4 z-20" : "absolute inset-0 z-20 flex flex-col gap-5 overflow-y-auto px-6 py-8 sm:px-10"}>
        <div className={`mx-auto w-full ${displayed ? "max-w-xl" : "my-auto max-w-2xl"}`}><StudioGenerationProgress key={streamingMessageId ?? "starting"} message={streaming} compact={Boolean(displayed)} onConversation={() => { if (!conversationOpen) onConversation(); }} />
        {!displayed && streaming?.content.trim() && <div className="mt-5 text-sm leading-7 text-zinc-300"><Suspense><MarkdownRenderer>{streaming.content}</MarkdownRenderer></Suspense></div>}</div>
      </div>}
      {!isStreaming && !displayed && <div className="absolute inset-0 overflow-y-auto px-8 py-10 sm:px-12">
        {assistant?.content.trim() ? <div className="mx-auto max-w-3xl text-[15px] leading-7 text-zinc-200"><Suspense><MarkdownRenderer>{assistant.content}</MarkdownRenderer></Suspense></div> : <div className="mx-auto flex h-full max-w-2xl flex-col justify-center">
          <p className="mb-4 text-[11px] uppercase tracking-[0.2em] text-violet-300/70">A space for your ideas</p>
          <h2 className="text-[clamp(28px,4vw,44px)] font-normal leading-tight tracking-tight text-zinc-100">What would you like<br />to see, understand, or try?</h2>
          <p className="mt-5 max-w-lg text-sm leading-7 text-zinc-500">Explore an idea, change the perspective, or build something unexpected. Studio takes shape around what you ask.</p>
          <div className="mt-8 flex flex-wrap gap-2">{["Explain an idea with an interactive visual", "Compare options in a dashboard", "Build a playful solar system simulation"].map((prompt) => <button key={prompt} disabled={isStreaming} onClick={() => onSuggestion(prompt)} className="rounded-full border border-white/10 px-4 py-2 text-xs text-zinc-400 hover:border-violet-300/30 hover:text-zinc-100 disabled:opacity-40">{prompt}</button>)}</div>
        </div>}
      </div>}
      {selected && !displayed && !failed && !isStreaming && <div role="status" className="absolute bottom-5 left-5 z-20 flex items-center gap-2 rounded-lg border border-white/10 bg-[#111218]/95 px-3 py-2 text-xs text-zinc-300"><Loader2 size={14} className="animate-spin motion-reduce:animate-none" />Opening the view</div>}
    </div>
    <div aria-live="polite" className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-t border-white/[0.06] px-4 py-2 text-xs text-zinc-500">
      {isStreaming ? <><Loader2 size={13} className="animate-spin text-violet-300 motion-reduce:animate-none" /><span>{progress}</span><button className={`${actionClass} ml-auto min-h-6`} aria-label="Stop Studio generation" onClick={onStop}>Stop</button></> : error ? <><span className="min-w-0 flex-1 text-amber-200/80">{error}</span>{failed && <button className={actionClass} onClick={() => dispatch({ type: "retry" })}>Retry view</button>}<button className={actionClass} disabled={!onRepair} onClick={() => onRepair?.(`Repair the Studio environment that failed to render. Runtime or validation feedback: ${error}. Preserve its data and interaction state.`)}>Repair</button></> : <span className="truncate">{actionMessage || (conversation?.studioEnvironment?.lastEvent ? `${selectionLabel ? `Selected ${selectionLabel}.` : "Selection saved."} Ask a follow-up to explore it.` : displayed?.revision.summary || "Direct Studio with the prompt below.")}</span>}
      {displayed && latest?.key !== displayed.key && !isStreaming && <button className={`${actionClass} ml-auto min-h-6`} onClick={() => select()}><ArrowLeft size={13} className="rotate-180" />View latest</button>}
      {!isStreaming && displayed && assistant?.content.trim() && <button className={`${actionClass} ml-auto min-h-6`} onClick={onConversation}>Read response</button>}
    </div>
    {sourceOpen && displayed && <SourceDialog entry={displayed} close={() => setSourceOpen(false)} />}
  </section>;
}
