import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const DEFAULT_CHAT_RATIO = 0.42;
const MIN_CHAT_WIDTH = 320;
const MIN_STUDIO_WIDTH = 320;
const STACK_BREAKPOINT = MIN_CHAT_WIDTH + MIN_STUDIO_WIDTH + 40;

type StudioSplitLayoutProps = {
  chat: ReactNode;
  studio: ReactNode;
};

export function StudioSplitLayout({ chat, studio }: StudioSplitLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(DEFAULT_CHAT_RATIO);
  const [stacked, setStacked] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "studio">("chat");
  const dragState = useRef<{ startX: number; startRatio: number } | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setStacked(entry.contentRect.width < STACK_BREAKPOINT);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const updateRatioFromPointer = useCallback((clientX: number) => {
    const element = containerRef.current;
    const drag = dragState.current;
    if (!element || !drag) return;
    const rect = element.getBoundingClientRect();
    const width = rect.width;
    if (width <= 0) return;
    const nextRatio = drag.startRatio + (clientX - drag.startX) / width;
    const minRatio = MIN_CHAT_WIDTH / width;
    const maxRatio = 1 - MIN_STUDIO_WIDTH / width;
    setRatio(Math.min(maxRatio, Math.max(minRatio, nextRatio)));
  }, []);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => updateRatioFromPointer(event.clientX);
    const handleUp = () => {
      dragState.current = null;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [updateRatioFromPointer]);

  const handleSeparatorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.08 : 0.04;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setRatio((value) => Math.max(0.2, value - step));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setRatio((value) => Math.min(0.8, value + step));
    } else if (event.key === "Home") {
      event.preventDefault();
      setRatio(0.2);
    } else if (event.key === "End") {
      event.preventDefault();
      setRatio(0.8);
    }
  };

  if (stacked) {
    return (
      <div ref={containerRef} className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <div role="tablist" aria-label="Studio workspace" className="flex shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
          {(["chat", "studio"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em] ${
                activeTab === tab ? "border-b-2 border-violet-400 text-violet-200" : "text-white/45"
              }`}
            >
              {tab === "chat" ? "Chat" : "Studio"}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{activeTab === "chat" ? chat : studio}</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="flex h-full min-h-0 min-w-0 overflow-hidden" style={{ width: `${ratio * 100}%` }}>
        {chat}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat and Studio panes"
        aria-valuemin={20}
        aria-valuemax={80}
        aria-valuenow={Math.round(ratio * 100)}
        tabIndex={0}
        onKeyDown={handleSeparatorKeyDown}
        onMouseDown={(event) => {
          dragState.current = { startX: event.clientX, startRatio: ratio };
        }}
        className="w-1 shrink-0 cursor-col-resize bg-[var(--color-border)] outline-none transition-colors hover:bg-violet-400/40 focus-visible:bg-violet-400/50"
      />
      <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">{studio}</div>
    </div>
  );
}
