import { useState, useRef, useCallback, useEffect } from "react";
import {
  Send,
  Check,
  X,
  Loader2,
  Sparkles,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { useDocumentStore, selectActiveDocumentContent } from "../document-store";
import { buildAiMessages, streamAiAssist, streamResearchDraft } from "../document-ai";
import type { AiAssistAction, AiAssistMessage, AiAssistParams } from "../document-ai";
import { AiMessageBubble } from "./ai-message-bubble";
import { cn } from "@/lib/utils";
import { useProviderStore } from "@/stores/provider-store";

const EDIT_ACTIONS: Set<AiAssistAction> = new Set([
  "improve", "expand", "shorten", "rewrite", "translate", "tone", "outline", "research_draft", "custom",
]);

type QuickAction = {
  id: AiAssistAction;
  label: string;
  color: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  { id: "improve", label: "Improve", color: "text-emerald-400" },
  { id: "expand", label: "Expand", color: "text-blue-400" },
  { id: "shorten", label: "Shorten", color: "text-amber-400" },
  { id: "rewrite", label: "Rewrite", color: "text-purple-400" },
  { id: "summarize", label: "Summarize", color: "text-pink-400" },
  { id: "translate", label: "Translate", color: "text-cyan-400" },
  { id: "tone", label: "Tone", color: "text-orange-400" },
  { id: "outline", label: "Outline", color: "text-indigo-400" },
  { id: "research_draft", label: "Research", color: "text-teal-400" },
];

interface AiAssistPanelProps {
  onClose: () => void;
}

export function AiAssistPanel({ onClose }: AiAssistPanelProps) {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const documents = useDocumentStore((s) => s.documents);
  const activeContent = useDocumentStore(selectActiveDocumentContent);
  const setContent = useDocumentStore((s) => s.setContent);

  const providerModels = useProviderStore((s) => s.models);
  const globalSelectedModel = useProviderStore((s) => s.selectedModel);
  const setSelectedModel = useProviderStore((s) => s.setSelectedModel);

  const doc = documents.find((d) => d.id === activeDocumentId);
  const [messages, setMessages] = useState<AiAssistMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<AiAssistAction | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [activeParams, setActiveParams] = useState<AiAssistParams>({});
  const [showParamForm, setShowParamForm] = useState<AiAssistAction | null>(null);
  const [reasoningEnabled, setReasoningEnabled] = useState(true);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const paramFormRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  useEffect(() => {
    if (!isStreaming) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isStreaming]);

  useEffect(() => {
    if (!showParamForm) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (paramFormRef.current && !paramFormRef.current.contains(e.target as Node)) {
        setShowParamForm(null);
        setActiveParams({});
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showParamForm]);

  useEffect(() => {
    if (!showModelDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showModelDropdown]);

  const currentModel = providerModels.find((m) => m.id === globalSelectedModel);

  const runAction = useCallback(
    async (action: AiAssistAction, customPrompt?: string, params?: AiAssistParams) => {
      if (!doc || isStreaming) return;

      const promptText = action === "custom"
        ? customPrompt ?? input
        : QUICK_ACTIONS.find((a) => a.id === action)?.label ?? action;

      if (action === "custom" && !customPrompt && !input.trim()) return;

      const newMessages: AiAssistMessage[] = [
        ...messages,
        { role: "user", content: promptText, action },
      ];
      setMessages(newMessages);
      setInput("");
      setIsStreaming(true);
      setStreamingContent("");
      setLastAction(action);
      setShowParamForm(null);

      const controller = new AbortController();
      abortRef.current = controller;

      let accumulated = "";

      try {
        if (action === "research_draft") {
          const query = params?.researchQuery ?? activeParams.researchQuery ?? promptText;
          await streamResearchDraft({
            documentContent: activeContent,
            query,
            signal: controller.signal,
            onChunk: (chunk, done) => {
              if (done) {
                setPendingSuggestion(accumulated);
                setIsStreaming(false);
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: accumulated, action },
                ]);
                setStreamingContent("");
              } else {
                accumulated += chunk;
                setStreamingContent(accumulated);
              }
            },
            onError: (error) => {
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `Error: ${error}` },
              ]);
              setIsStreaming(false);
              setStreamingContent("");
            },
          });
        } else {
          const aiMessages = buildAiMessages(
            activeContent,
            doc.title,
            action,
            action === "custom" ? promptText : "",
            undefined,
            messages,
            params ?? activeParams,
          );

          await streamAiAssist({
            messages: aiMessages,
            signal: controller.signal,
            reasoningEnabled,
            onChunk: (chunk, done) => {
              if (done) {
                setPendingSuggestion(accumulated);
                setIsStreaming(false);
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: accumulated, action },
                ]);
                setStreamingContent("");
              } else {
                accumulated += chunk;
                setStreamingContent(accumulated);
              }
            },
            onError: (error) => {
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `Error: ${error}` },
              ]);
              setIsStreaming(false);
              setStreamingContent("");
            },
          });
        }
      } catch {
        setIsStreaming(false);
        setStreamingContent("");
      }
    },
    [doc, activeContent, input, messages, isStreaming, activeParams, reasoningEnabled],
  );

  const handleActionClick = useCallback(
    (action: AiAssistAction) => {
      const parameterizedActions: AiAssistAction[] = ["translate", "tone", "outline", "research_draft"];
      if (parameterizedActions.includes(action)) {
        setShowParamForm(action);
      } else {
        void runAction(action);
      }
    },
    [runAction],
  );

  const handleParamSubmit = useCallback(() => {
    if (!showParamForm) return;
    void runAction(showParamForm, undefined, activeParams);
  }, [showParamForm, activeParams, runAction]);

  const handleAccept = useCallback(() => {
    if (pendingSuggestion) {
      setContent(pendingSuggestion);
      setPendingSuggestion(null);
    }
  }, [pendingSuggestion, setContent]);

  const handleReject = useCallback(() => {
    setPendingSuggestion(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showParamForm && e.key === "Escape") {
        setShowParamForm(null);
        setActiveParams({});
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void runAction("custom");
      }
    },
    [runAction, showParamForm],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const handleNewChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setIsStreaming(false);
    setPendingSuggestion(null);
    setLastAction(null);
    setStreamingContent("");
    setShowParamForm(null);
    setActiveParams({});
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  return (
    <div className="ai-assist-panel flex h-full w-[360px] shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="z-10 flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2 bg-[var(--color-surface)]">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[var(--color-accent)]" />
          <span className="text-[13px] font-semibold text-[var(--color-text)]">AI Assist</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleNewChat}
            className="grid size-6 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white transition-colors"
            title="New chat"
          >
            <RotateCcw className="size-3" />
          </button>
          <button
            type="button"
            onClick={() => setReasoningEnabled((v) => !v)}
            className={cn(
              "grid size-6 place-items-center rounded transition-colors",
              reasoningEnabled
                ? "bg-violet-500/20 text-violet-300"
                : "text-[var(--color-text-dim)] hover:bg-white/5",
            )}
            title={reasoningEnabled ? "Reasoning on" : "Reasoning off"}
          >
            <Sparkles className="size-3" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="grid size-6 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Model selector row */}
      <div className="border-b border-[var(--color-border)] px-3 py-1.5">
        <div ref={modelDropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setShowModelDropdown((v) => !v)}
            className="flex h-7 w-full items-center gap-2 rounded-md border border-[var(--color-border)] bg-white/[0.03] px-2 text-[11px] text-[var(--color-text)] hover:border-[var(--color-border-strong)] transition-colors"
          >
            <span className="flex-1 truncate text-left font-medium">
              {currentModel?.name ?? "Select model"}
            </span>
            <ChevronDown
              className={cn(
                "size-3 text-[var(--color-text-dim)] transition-transform",
                showModelDropdown && "rotate-180",
              )}
            />
          </button>
          {showModelDropdown && (
            <div className="absolute left-0 top-full z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] shadow-xl shadow-black/40">
              {providerModels.length === 0 ? (
                <div className="px-3 py-4 text-center text-[11px] text-[var(--color-text-dim)]">
                  No models available
                </div>
              ) : (
                providerModels.map((m) => {
                  const active = m.id === globalSelectedModel;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedModel(m.id);
                        setShowModelDropdown(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-2 py-1.5 text-[11px] transition-colors",
                        active
                          ? "bg-[var(--color-accent-soft)] text-white"
                          : "text-[var(--color-text)] hover:bg-white/[0.04]",
                      )}
                    >
                      <span className="flex-1 truncate text-left">{m.name}</span>
                      {m.contextWindow && (
                        <span className="font-mono text-[9px] text-[var(--color-text-dim)]">
                          {(m.contextWindow / 1000).toFixed(0)}K
                        </span>
                      )}
                      {active && <Check className="size-3 shrink-0 text-[var(--color-accent)]" />}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {doc && (
        <div className="border-b border-[var(--color-border)] px-3 py-2">
          <p className="text-[11px] text-[var(--color-text-dim)]">
            Editing: <span className="text-[var(--color-text)]">{doc.title}</span>
          </p>
          <p className="text-[10px] text-[var(--color-text-dim)]">
            {activeContent.split(/\s+/).filter(Boolean).length} words
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-[var(--color-border)] px-3 py-2">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => handleActionClick(action.id)}
            disabled={isStreaming || !doc}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
              "bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-40",
              action.color,
            )}
          >
            {action.label}
          </button>
        ))}
      </div>

      {showParamForm && (
        <div ref={paramFormRef} className="border-b border-[var(--color-border)] px-3 py-2">
          {showParamForm === "translate" && (
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-[var(--color-text-dim)]">Target Language</label>
              <select
                value={activeParams.targetLanguage ?? "English"}
                onChange={(e) => setActiveParams({ ...activeParams, targetLanguage: e.target.value })}
                className="veyra-select w-full"
              >
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Chinese">Chinese</option>
                <option value="Japanese">Japanese</option>
                <option value="Korean">Korean</option>
                <option value="Portuguese">Portuguese</option>
                <option value="Arabic">Arabic</option>
                <option value="Russian">Russian</option>
              </select>
            </div>
          )}
          {showParamForm === "tone" && (
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-[var(--color-text-dim)]">Tone</label>
              <select
                value={activeParams.tone ?? "formal"}
                onChange={(e) => setActiveParams({ ...activeParams, tone: e.target.value })}
                className="veyra-select w-full"
              >
                <option value="formal">Formal</option>
                <option value="casual">Casual</option>
                <option value="technical">Technical</option>
                <option value="creative">Creative</option>
                <option value="academic">Academic</option>
                <option value="persuasive">Persuasive</option>
                <option value="concise">Concise</option>
              </select>
            </div>
          )}
          {showParamForm === "outline" && (
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-[var(--color-text-dim)]">Depth (1-4)</label>
              <input
                type="number"
                min={1}
                max={4}
                value={activeParams.outlineDepth ?? 2}
                onChange={(e) => setActiveParams({ ...activeParams, outlineDepth: Number(e.target.value) })}
                className="rounded-md border border-[var(--color-border)] bg-white/[0.03] px-2 py-1 text-[12px] text-[var(--color-text)] focus:border-[var(--color-accent)]/50 focus:outline-none"
              />
            </div>
          )}
          {showParamForm === "research_draft" && (
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-[var(--color-text-dim)]">Research Topic / Query</label>
              <input
                type="text"
                value={activeParams.researchQuery ?? ""}
                onChange={(e) => setActiveParams({ ...activeParams, researchQuery: e.target.value })}
                placeholder="e.g., latest advances in..."
                className="rounded-md border border-[var(--color-border)] bg-white/[0.03] px-2 py-1 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)]/50 focus:outline-none"
              />
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => {
                setShowParamForm(null);
                setActiveParams({});
              }}
              className="flex-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-dim)] hover:bg-white/[0.03]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleParamSubmit}
              disabled={isStreaming || !doc}
              className="flex-1 rounded-md bg-[var(--color-accent)] px-2 py-1 text-[11px] font-medium text-white hover:brightness-110 disabled:opacity-40"
            >
              Run
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && !isStreaming ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="grid size-12 place-items-center rounded-xl bg-white/[0.03]">
              <Sparkles className="size-6 text-[var(--color-text-dim)]" />
            </div>
            <p className="text-[12px] text-[var(--color-text-dim)]">
              Ask AI to help with your document, or use a quick action above.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg, i) => (
              <AiMessageBubble key={i} message={msg} />
            ))}
            {isStreaming && streamingContent && (
              <AiMessageBubble
                message={{ role: "assistant", content: streamingContent }}
              />
            )}
            {isStreaming && !streamingContent && (
              <div className="flex gap-2">
                <div className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--color-accent)]/20">
                  <Loader2 className="size-3.5 animate-spin text-[var(--color-accent)]" />
                </div>
                <div className="rounded-xl bg-white/[0.05] px-3 py-2 text-[12px] text-[var(--color-text-dim)]">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {pendingSuggestion && lastAction && EDIT_ACTIONS.has(lastAction) && (
        <div className="border-t border-[var(--color-border)] px-3 py-2">
          <p className="mb-2 text-[11px] font-medium text-[var(--color-text-dim)]">
            Apply this change?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAccept}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-500/15 px-3 py-1.5 text-[12px] font-medium text-emerald-400 hover:bg-emerald-500/25 transition-colors"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={handleReject}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-red-500/15 px-3 py-1.5 text-[12px] font-medium text-red-400 hover:bg-red-500/25 transition-colors"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-[var(--color-border)] px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI anything..."
            disabled={isStreaming}
            className="flex-1 rounded-md border border-[var(--color-border)] bg-white/[0.03] px-3 py-1.5 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)]/50 focus:outline-none disabled:opacity-50"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="grid size-7 place-items-center rounded-md bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void runAction("custom")}
              disabled={!input.trim() || !doc}
              className="grid size-7 place-items-center rounded-md bg-[var(--color-accent)] text-white hover:brightness-110 disabled:opacity-40 transition-colors"
            >
              <Send className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
