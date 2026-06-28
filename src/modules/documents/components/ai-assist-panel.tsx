import { useState, useRef, useCallback, useEffect } from "react";
import {
  WandSparkles,
  Scissors,
  StretchHorizontal,
  MessageSquareQuote,
  Send,
  Check,
  X,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useDocumentStore, selectActiveDocumentContent } from "../document-store";
import { buildAiMessages, streamAiAssist } from "../document-ai";
import type { AiAssistAction, AiAssistMessage } from "../document-ai";
import { AiMessageBubble } from "./ai-message-bubble";
import { cn } from "@/lib/utils";

type QuickAction = {
  id: AiAssistAction;
  label: string;
  icon: React.ReactNode;
  color: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  { id: "improve", label: "Improve", icon: <WandSparkles className="size-3.5" />, color: "text-emerald-400" },
  { id: "expand", label: "Expand", icon: <StretchHorizontal className="size-3.5" />, color: "text-blue-400" },
  { id: "shorten", label: "Shorten", icon: <Scissors className="size-3.5" />, color: "text-amber-400" },
  { id: "rewrite", label: "Rewrite", icon: <MessageSquareQuote className="size-3.5" />, color: "text-purple-400" },
  { id: "summarize", label: "Summarize", icon: <Sparkles className="size-3.5" />, color: "text-pink-400" },
];

interface AiAssistPanelProps {
  onClose: () => void;
}

export function AiAssistPanel({ onClose }: AiAssistPanelProps) {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const documents = useDocumentStore((s) => s.documents);
  const activeContent = useDocumentStore(selectActiveDocumentContent);
  const setContent = useDocumentStore((s) => s.setContent);

  const doc = documents.find((d) => d.id === activeDocumentId);
  const [messages, setMessages] = useState<AiAssistMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<AiAssistAction | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  useEffect(() => {
    if (!isStreaming) inputRef.current?.focus();
  }, [isStreaming]);

  const runAction = useCallback(
    async (action: AiAssistAction, customPrompt?: string) => {
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

      const aiMessages = buildAiMessages(
        activeContent,
        doc.title,
        action,
        action === "custom" ? promptText : "",
        undefined,
        messages,
      );

      const controller = new AbortController();
      abortRef.current = controller;

      let accumulated = "";

      try {
        await streamAiAssist({
          messages: aiMessages,
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
      } catch {
        setIsStreaming(false);
        setStreamingContent("");
      }
    },
    [doc, activeContent, input, messages, isStreaming],
  );

  const handleAccept = useCallback(() => {
    if (pendingSuggestion) {
      if (lastAction !== "summarize") {
        setContent(pendingSuggestion);
      }
      setPendingSuggestion(null);
    }
  }, [pendingSuggestion, lastAction, setContent]);

  const handleReject = useCallback(() => {
    setPendingSuggestion(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void runAction("custom");
      }
    },
    [runAction],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return (
    <div className="flex h-full w-[360px] shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[var(--color-accent)]" />
          <span className="text-[13px] font-semibold text-[var(--color-text)]">AI Assist</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-6 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        >
          <X className="size-3.5" />
        </button>
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

      <div className="flex gap-1 border-b border-[var(--color-border)] px-3 py-2">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => void runAction(action.id)}
            disabled={isStreaming || !doc}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
              "bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-40",
              action.color,
            )}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>

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

      {pendingSuggestion && (
        <div className="border-t border-[var(--color-border)] px-3 py-2">
          <p className="mb-2 text-[11px] font-medium text-[var(--color-text-dim)]">
            {lastAction === "summarize" ? "Summary ready" : "Apply this change?"}
          </p>
          <div className="flex gap-2">
            {lastAction === "summarize" ? (
              <button
                type="button"
                onClick={handleAccept}
                className="flex flex-1 items-center justify-center gap-1 rounded-md bg-[var(--color-accent)]/15 px-3 py-1.5 text-[12px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)]/25 transition-colors"
              >
                <Check className="size-3.5" />
                Dismiss
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleAccept}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-500/15 px-3 py-1.5 text-[12px] font-medium text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                >
                  <Check className="size-3.5" />
                  Accept
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md bg-red-500/15 px-3 py-1.5 text-[12px] font-medium text-red-400 hover:bg-red-500/25 transition-colors"
                >
                  <X className="size-3.5" />
                  Reject
                </button>
              </>
            )}
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
