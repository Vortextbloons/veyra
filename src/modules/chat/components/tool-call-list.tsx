import type { ChatMessage } from "@/modules/chat/chat-types";
import { CodeExecutionBlock } from "@/modules/chat/components/code-execution-block";
import { ToolCallIndicator } from "@/modules/chat/components/tool-call-indicator";
import { WebSearchToolCallBlock } from "@/modules/chat/components/web-search-block";
import { webSearchRoundForToolCall } from "@/lib/web-search-state";

type ToolCallListProps = {
  message: ChatMessage;
};

export function ToolCallList({ message }: ToolCallListProps) {
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

        return <ToolCallIndicator key={toolState.id} state={toolState} />;
      })}
    </>
  );
}
