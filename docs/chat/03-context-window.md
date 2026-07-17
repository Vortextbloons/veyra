# Context Window Management

## Token Estimation

Uses a **4-chars-per-token heuristic** (`src/lib/context.ts`) — simple but effective for trimming decisions. The token budget is calculated as:

```
token_budget = context_limit - reserved_output_tokens
```

Messages are trimmed oldest-first until the budget is satisfied.

## Auto-Summarization

When context usage exceeds 55%:
- Older turns are folded into a conversation summary
- The summary preserves the last 8 messages verbatim
- Summary is injected as `<veyra_conversation_summary>` block

## Context Stats

The UI displays:
- Estimated tokens used
- Percentage of context window used
- Number of included/dropped messages

## Message Trimming Strategy

1. Start from the most recent message and work backwards
2. Include messages until the token budget is exhausted
3. Remaining messages are dropped from context
4. The summary block preserves information from dropped messages
