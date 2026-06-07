import type { ChatMessage } from "@/lib/chat-types";
import { ToolCallIndicator } from "@/components/chat/tool-call-indicator";
import { WebSearchToolCallBlock } from "@/components/chat/web-search-block";

export type ToolCallListProps = {
  message: ChatMessage;
};

export function ToolCallList({ message }: ToolCallListProps) {
  if (!message.toolStates?.length) return null;

  return (
    <>
      {message.toolStates.map((toolState) =>
        toolState.name === "web_search" && message.webSearchState ? (
          <WebSearchToolCallBlock
            key={toolState.id}
            toolState={toolState}
            state={message.webSearchState}
          />
        ) : (
          <ToolCallIndicator key={toolState.id} state={toolState} />
        ),
      )}
    </>
  );
}
