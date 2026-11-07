# Hooks

React hooks used across Veyra's frontend.

## Chat Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useChatSend` | `src/hooks/use-chat-send.ts` | Builds the `agent_pi` job: prompt, model, reasoning, attachments, LM Studio model load |
| `useChatPipeline` | `src/hooks/use-chat-pipeline.ts` | Provider/model selection plus `handleSend`, `handleNewChat`, `handleDeleteChat` |
| `useChatAttachments` | `src/hooks/use-chat-attachments.ts` | Attachment filtering and validation |
| `useChatContextPanel` | `src/hooks/use-chat-context-panel.ts` | Resolved context length, reserved output tokens, context stats |
| `useModelReasoning` | `src/hooks/use-model-reasoning.ts` | Reasoning levels the selected model actually accepts |

## Agent Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useAgentDispatch` | `src/hooks/use-agent-dispatch.ts` | Session list, active session, runtime check, workspace sessions |

## Scheduler Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useAiScheduler` | `src/hooks/use-ai-scheduler.ts` | Subscribe to scheduler snapshots |

## UI Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useClickOutside` | `src/hooks/use-click-outside.ts` | Click-outside detection |
| `useShutdownState` | `src/hooks/use-shutdown-state.ts` | Shutdown overlay state |
| `useAppUpdateCheck` | `src/hooks/use-app-update-check.ts` | Update check on startup |

Editing, regeneration, forking, and message-level streaming hooks were removed
with the in-browser chat orchestrator. Those actions are now session operations
(`stopSession`, `steerSession`, continue-session sends) exposed by
`agent-store`.
