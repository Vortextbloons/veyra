# Hooks

React hooks used across Veyra's frontend for chat, scheduling, and UI interactions.

## Chat Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useChatSend` | `src/hooks/use-chat-send.ts` | Message send logic |
| `useChatPipeline` | `src/hooks/use-chat-pipeline.ts` | Pipeline lifecycle — returns `handleSend`, `handleStopStreaming`, `handleEdit*`, `handleRegenerate`, `handleCopyMessage`, `handleForkMessage`, `handleDeleteMessage`, `handleTriggerMemoryExtraction`, streaming state, and provider info |
| `useChatAttachments` | `src/hooks/use-chat-attachments.ts` | File attachment management |
| `useChatEditing` | `src/hooks/use-chat-editing.ts` | Message editing |
| `useChatRegeneration` | `src/hooks/use-chat-regeneration.ts` | Response regeneration |
| `useChatContextPanel` | `src/hooks/use-chat-context-panel.ts` | Context panel state |

## Scheduler Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useAiScheduler` | `src/hooks/use-ai-scheduler.ts` | AI job scheduling |
| `runChatJob` | `src/hooks/run-chat-job.ts` | Chat job execution |

## Agent Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useAgentDispatch` | `src/hooks/use-agent-dispatch.ts` | Agent dispatch logic |

## UI Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useClickOutside` | `src/hooks/use-click-outside.ts` | Click-outside detection |
| `useAppZoom` | `src/hooks/use-app-zoom.ts` | App zoom control |
| `useShutdownState` | `src/hooks/use-shutdown-state.ts` | Shutdown state tracking |
| `useAppUpdateCheck` | `src/hooks/use-app-update-check.ts` | Update notification check |
