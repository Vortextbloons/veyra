# Agent Events

Events are streamed from Pi CLI via Tauri events.

## Event Types

| Event | Description |
|-------|-------------|
| `status` | Session status change |
| `reasoning` | AI reasoning/thinking |
| `tool` | Tool execution |
| `output` | Text output |
| `error` | Error occurred |
| `result` | Final result |
| `token_update` | Token usage update |

## Event Channels

- `agent://run-finished` — Run completed
- `agent://run-event` — Live event during execution

## Live Output Merging

- Reasoning deltas are merged incrementally
- Tool events are merged by `toolCallId` to avoid duplicates
- Output streaming displays text as it arrives
- ANSI escape codes are stripped from output
