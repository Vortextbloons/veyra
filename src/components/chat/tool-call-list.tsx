import type { ChatMessage } from "@/lib/chat-types";
import { ToolCallIndicator } from "@/components/chat/tool-call-indicator";
import { WebSearchToolCallBlock } from "@/components/chat/web-search-block";
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

        return <ToolCallIndicator key={toolState.id} state={toolState} />;
      })}
    </>
  );
}
