# Chat Streaming

The UI supports real-time streaming of multiple content types during AI response generation.

## Stream Types

| Type | Description |
|------|-------------|
| Content tokens | The AI's response text |
| Reasoning tokens | Chain-of-thought (shown in expandable block) |
| Web search state | Search/fetch/reading progress indicators |
| Tool calls | Live tool execution indicators |

## Stream Architecture

- Provider adapter streams tokens via callbacks
- Content tokens update the message buffer character by character
- Reasoning tokens are accumulated separately for display in expandable sections
- Tool call updates are merged into the message's tool call state
- Web search progress updates the search state indicator

## Stop / Cancel

While streaming, pressing **Escape** stops the active generation. The `Composer` component listens for `Escape` when `busy` and calls `onStop`, which cancels the AI job via `aiScheduler.cancelAiJob` and resets streaming state.

## Provider Compatibility

Both LM Studio and cloud providers use the same streaming interface, ensuring consistent UI behavior regardless of provider.
