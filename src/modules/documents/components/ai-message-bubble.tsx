import { lazy, Suspense } from "react";
import { Bot, User } from "lucide-react";
import type { AiAssistMessage } from "../document-ai";
import { cn } from "@/lib/utils";

const MarkdownRenderer = lazy(() =>
  import("@/components/markdown-renderer").then((m) => ({ default: m.MarkdownRenderer })),
);

interface AiMessageBubbleProps {
  message: AiAssistMessage;
}

export function AiMessageBubble({ message }: AiMessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--color-accent)]/20">
          <Bot className="size-3.5 text-[var(--color-accent)]" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3 py-2 text-[12px] leading-relaxed",
          isUser
            ? "bg-[var(--color-accent)]/15 text-[var(--color-text)]"
            : "bg-white/[0.05] text-[var(--color-text)]",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <Suspense fallback={<span className="text-[var(--color-text-dim)]">Loading...</span>}>
            <MarkdownRenderer className="leading-relaxed">{message.content}</MarkdownRenderer>
          </Suspense>
        )}
      </div>
      {isUser && (
        <div className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10">
          <User className="size-3.5 text-[var(--color-text-dim)]" />
        </div>
      )}
    </div>
  );
}
