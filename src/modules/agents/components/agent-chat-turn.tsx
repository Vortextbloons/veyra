import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import type { AgentChatTurnModel } from "@/modules/agents/agent-chat-turns";
import { AgentActivityCard } from "@/modules/agents/components/agent-output-view";
import { TypewriterMarkdown } from "@/modules/agents/components/typewriter-markdown";
import { MessageBubble } from "@/modules/chat/components/message-bubble";
import { ArtifactBlock } from "@/modules/chat/components/artifact-block";
import { normalizeArtifact } from "@/modules/chat/artifact";
import { useAgentStore } from "../agent-store";

// Loaded only for turns that carry an interactive answer.
const InteractiveAnswerBlock = lazy(() =>
  import("@/modules/chat/components/interactive-answer-block").then((m) => ({ default: m.InteractiveAnswerBlock })),
);

export function AgentChatTurn({
  turn,
  onFollowUp,
  isStreaming = false,
}: {
  turn: AgentChatTurnModel;
  onFollowUp?: (prompt: string) => void;
  isStreaming?: boolean;
}) {
  if (turn.role === "user") {
    return <MessageBubble message={{ id: turn.id, role: "user", content: turn.content, attachments: turn.attachments, timestamp: 0 }} isStreaming={false} layout={{ messagesPx: "px-5", messageText: "text-[15px]", userMaxW: "max-w-[85%]", composerText: "text-[14px]", footerPx: "px-4" }} onCopy={() => void navigator.clipboard.writeText(turn.content)} />;
  }

  const isError = turn.role === "error";
  if (turn.kind) {
    return <AgentActivityCard turn={turn} />;
  }

  if (!isError && !turn.artifact && !turn.interactiveAnswer) {
    return <MessageBubble message={{ id: turn.id, role: "assistant", content: turn.content, reasoning: turn.reasoning, modelId: turn.model, timestamp: 0 }} isStreaming={turn.pending === true || isStreaming} layout={{ messagesPx: "px-5", messageText: "text-[15px]", userMaxW: "max-w-[85%]", composerText: "text-[14px]", footerPx: "px-4" }} onCopy={() => void navigator.clipboard.writeText(turn.content)} />;
  }

  const modelShortId = turn.model?.split("/").pop()?.trim() || "";
  const assistantLabel = modelShortId || "Assistant";

  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="agent-turn-label flex items-center gap-2">
          <span className="truncate font-medium text-white">{assistantLabel}</span>
          {isError && turn.title && (
            <>
              <span className="size-1 rounded-full bg-[var(--color-text-dim)]/50" />
              <span className="text-red-300/80">{turn.title}</span>
            </>
          )}
        </div>
        <div
          className={`agent-response ${
            isError
              ? "border-red-500/20 bg-red-500/[0.06] text-red-300"
              : "text-[var(--color-text)]"
          }`}
        >
          {turn.artifact ? <ArtifactBlock artifact={turn.artifact} messageId={turn.id} onDocumentSave={(title, content) => {
            if (!turn.artifact) return false;
            const artifact = normalizeArtifact({ ...turn.artifact, title, content }, turn.artifact.id);
            if (!artifact.ok) return false;
            useAgentStore.setState((state) => ({ sessions: state.sessions.map((session) => ({ ...session, events: session.events.map((event) => event.id === turn.id ? { ...event, artifact: artifact.artifact } : event) })) }));
            return true;
          }} /> : turn.interactiveAnswer ? (
            <Suspense fallback={null}>
              <InteractiveAnswerBlock answer={turn.interactiveAnswer} onFollowUp={onFollowUp} />
            </Suspense>
          ) : turn.pending ? (
            <div className="flex items-center gap-2 text-[var(--color-text-dim)]">
              <Loader2 className="size-3.5 animate-spin text-[var(--color-accent)]" />
              <span>Thinking...</span>
            </div>
          ) : isError ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed">
              {turn.content}
            </pre>
          ) : (
            <TypewriterMarkdown content={turn.content} enabled={turn.animate === true} />
          )}
        </div>
      </div>
    </div>
  );
}
