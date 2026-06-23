import type { ChatMessage } from "@/modules/chat/chat-types";
import { CodeExecutionBlock } from "@/modules/chat/components/code-execution-block";
import { ToolCallIndicator } from "@/modules/chat/components/tool-call-indicator";
import { WebSearchToolCallBlock } from "@/modules/chat/components/web-search-block";
import { ScratchpadBlock } from "@/modules/chat/components/scratchpad-block";
import { AskQuestionBlock } from "@/modules/chat/components/ask-question-block";
import { webSearchRoundForToolCall } from "@/lib/web-search-state";

type ToolCallListProps = {
  message: ChatMessage;
  pendingQuestion?: {
    toolCallId: string;
    questions: Array<{ text: string; options?: string[] }>;
    answers: Record<number, string>;
  };
  onResolveQuestion?: (answers: Record<number, string>) => void;
};

export function ToolCallList({ message, pendingQuestion, onResolveQuestion }: ToolCallListProps) {
  if (!message.toolStates?.length) return null;

  const webSearchToolStates = message.toolStates.filter(
    (toolState) => toolState.name === "web_search",
  );
  const webSearchRoundTotal = webSearchToolStates.length;

  return (
    <>
      {message.toolStates.map((toolState) => {
        if (toolState.name === "web_search") {
          const round = webSearchRoundForToolCall(message.webSearchState, toolState.id);
          if (!round) return null;
          const roundIndex =
            webSearchRoundTotal > 1
              ? webSearchToolStates.findIndex((item) => item.id === toolState.id) + 1
              : undefined;
          return (
            <WebSearchToolCallBlock
              key={toolState.id}
              toolState={toolState}
              round={round}
              roundIndex={roundIndex}
              roundTotal={webSearchRoundTotal > 1 ? webSearchRoundTotal : undefined}
            />
          );
        }

        if (toolState.name === "code_execution") {
          return <CodeExecutionBlock key={toolState.id} state={toolState} />;
        }

        if (toolState.name === "scratchpad_write") {
          return (
            <ScratchpadBlock
              key={toolState.id}
              state={toolState}
              scratchpadContent={message.scratchpadContent}
            />
          );
        }

        if (toolState.name === "ask_question") {
          const isPending = Boolean(pendingQuestion?.toolCallId === toolState.id && onResolveQuestion);
          return (
            <AskQuestionBlock
              key={toolState.id}
              state={toolState}
              questions={isPending ? pendingQuestion?.questions : undefined}
              isPending={isPending}
              onAnswer={onResolveQuestion ?? (() => {})}
            />
          );
        }

        return <ToolCallIndicator key={toolState.id} state={toolState} />;
      })}
    </>
  );
}
