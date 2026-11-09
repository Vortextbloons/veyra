# State Management

Veyra keeps one owner per fact. The rule is simple: if two stores hold the same
value, one of them is a bug waiting to be reported.

## Key Files

| File | Purpose |
|------|---------|
| `src/stores/chat-store.ts` | Conversation index over the Pi transcript |
| `src/stores/settings-store.ts` | All app settings (7 slices) |
| `src/stores/provider-store.ts` | Provider connection, model listing, selected model |
| `src/stores/connectivity-store.ts` | Online/offline/local-only state |
| `src/stores/update-store.ts` | App update state |
| `src/modules/agents/agent-store.ts` | Pi sessions (the transcript) |
| `src/modules/projects/project-store.ts` | Projects, active project, workspace resources |
| `src/modules/extensions/extensions-store.ts` | MCP servers, approvals, diagnostics |
| `src/modules/extensions/skills-store.ts` | Skill library and per-request/per-chat selection |
| `src/modules/memory/memory-store.ts` | Durable memory facts |

## Ownership

| Fact | Owner | Consumers |
|------|-------|-----------|
| Session transcript | `agent-store.sessions` | `pi-conversation-storage` (mirror), chat UI |
| Conversation index (title, project, artifacts) | `chat-store` | sidebar, project sidebar |
| Active conversation | `chat-store.activeConversationId` | chat panel |
| Active project | `project-store.activeProjectId` | composer scope, memory scoping |
| Workspace path | `agent-store.projectPath` | session filtering, Pi dispatch |
| Selected model | `provider-store.selectedModel` | composer, context meter |
| Reasoning level | `settings-store` (`reasoningLevel`, `reasoningLevelByModel`) | send path, Pi model config |
| Chat behavior toggles | `settings-store` chat slice | tool registry |
| Web search defaults | `settings-store` web-search slice | search orchestrator, tools |

`chat-store` is deliberately thin: `modules/agents/pi-conversation-storage.ts`
is its only writer. It never builds a transcript of its own, and the removed
`streamingBuffer` / `toolStates` / `scratchpadContent` plumbing is gone with the
old orchestrator.

## Settings Store (7 Slices)

| Slice | File | Purpose |
|-------|------|---------|
| `ui-layout-slice` | `ui-layout-slice.ts` | Active nav, recent-chats collapsed |
| `model-slice` | `model-slice.ts` | Model defaults, per-model overrides, prompts, reasoning |
| `web-search-slice` | `web-search-slice.ts` | Search defaults, parameters, extraction |
| `chat-slice` | `chat-slice.ts` | Rich output and sandboxed JavaScript execution toggles |
| `connectivity-slice` | `connectivity-slice.ts` | Online/offline preference |
| `chat-slice` | `chat-slice.ts` | Interactive answers, artifacts, background jobs |
| `update-slice` | `update-slice.ts` | Auto-check updates, dismissed version |

All settings persist to `localStorage` under `veyra.settings.v1`. Adding a field
means three edits — slice state/action, `DEFAULT_*_STATE`, and
`partializeSettings` — so a setting without a `partialize` entry silently resets
on restart.

## Agent Store Persistence

`agent-store` persists only `activeSessionId`, `projectPath`, and `projects`.
Session events live in the encrypted conversation snapshot, written by
`pi-conversation-storage.ts` on a debounce. Persisting events in both places
would rewrite every transcript on each streamed line and create two copies of
the same history that can disagree after a crash.

## Selector Discipline

- Subscribe to the narrowest slice: `useSettingsStore((s) => s.foo)`.
- Never subscribe to a whole store in a component that renders per token.
- Full-collection subscriptions belong to collection consumers (recent chats,
  project sidebar). Active-only consumers should read the active record.

## Project Scope

`project-store` mirrors a project's directory resource into
`settings.agentProjectPath`. `resolveAgentProjectId` (in
`modules/agents/agent-session-context.ts`) uses that mapping so a session keyed
by workspace path can find its project for memory and skill scoping. Ambiguous
or missing mappings fail closed: no project memory is injected.
