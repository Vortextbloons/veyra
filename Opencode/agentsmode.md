# Chat Toggle Agents Mode Implementation Spec

## 1. Intent

Agents Mode should be easy to enter from chat with a clear toggle, but the implementation should stay separated enough that opencode does not leak into the normal chat pipeline.

Veyra owns the product shell, projects, memory, chat history, settings, and review UI. Opencode runs in the background only when an agent session needs coding-agent execution.

```text
Normal Chat
Veyra Chat -> Veyra Provider Layer -> LM Studio / OpenAI-Compatible Provider

Chat With Agents Toggle On
Veyra Chat Shell -> Agent Mode Adapter -> Agent Session Manager -> Opencode Background Runtime
```

The first implementation should be spec-driven and minimal: keep the chat UX familiar, create separated agent boundaries behind the toggle, then connect opencode behind those boundaries.

## 2. Current Codebase Baseline

The current app has:

- `src/components/chat-panel.tsx` with a UI-local `mode: "chat" | "agents"` state.
- Normal chat state in `src/stores/chat-store.ts`.
- Chat orchestration in `src/lib/chat-orchestrator.ts` and `src/lib/chat-actions.ts`.
- Tauri command registration in `src-tauri/src/lib.rs`.
- Shell plugin support through `@tauri-apps/plugin-shell` and `tauri_plugin_shell`.
- No persisted agent store yet.
- No project model yet.
- No opencode process bridge yet.

This means the correct next step is not to wire opencode directly into the chat orchestrator. The next step is to introduce a small Agents module with its own state, types, and backend bridge, then let `chat-panel.tsx` switch between the normal chat composer behavior and an agent-aware composer behavior.

## 3. Product Rule

Agents Mode is a chat toggle with separated internals.

Normal chat must continue to work without opencode installed, configured, or running.

```text
Do not start opencode on app launch.
Do not start opencode from normal chat.
Do not route normal assistant messages through opencode.
Only start opencode after the user explicitly starts or resumes an agent session.
```

Agents Mode should primarily be reached from the chat UI. The toggle should feel lightweight and fast, but it should not make normal chat share orchestration, persistence, permissions, or process lifecycle with opencode.

## 4. UX Shape

### 4.1 Chat Toggle

The primary entry point is a chat header toggle:

```text
[ Chat ] [ Agents ]
```

When `Chat` is selected:

```text
Composer -> normal chat actions -> Veyra provider layer
```

When `Agents` is selected:

```text
Composer -> agent mode adapter -> opencode background runtime
```

The toggle should be visually obvious, reversible, and local to the active conversation/chat surface.

### 4.2 Agent Panel Inside Chat

Agent mode should keep the main chat shell, but swap the inner behavior and supporting panels:

```text
Chat Shell
├─ Header
│  ├─ Provider/model controls for Chat mode
│  ├─ Chat / Agents toggle
│  └─ Agent status when Agents mode is active
├─ Message timeline
│  ├─ Normal chat messages
│  └─ Agent session cards when Agents mode is active
├─ Agent controls row
│  ├─ Workspace path / project picker
│  ├─ Agent mode selector
│  └─ Runtime availability
├─ Composer
│  ├─ Normal prompt composer in Chat mode
│  └─ Agent task composer in Agents mode
└─ Optional review drawer
   ├─ Activity stream
   ├─ Changed files
   └─ Commands / exit status
```

This preserves the nice chat-toggle experience while keeping long-running coding tasks, permission prompts, terminal output, and file diffs structurally separate from regular assistant replies.

### 4.3 Message Presentation

In Agents mode, the chat timeline should show compact agent session cards rather than dumping raw terminal output as normal assistant text.

```text
User: Redo the settings page layout.

Agent Session Card
├─ Mode: Plan
├─ Runtime: Opencode
├─ Status: Running
├─ Summary / current step
├─ Activity count
└─ Open details
```

The detail drawer can show stdout/stderr, changed files, commands, and review controls. This keeps the chat readable and keeps agent details available.

### 4.4 First Agent Modes

Ship modes in this order:

- `plan`: read/analyze only by default.
- `review`: read/analyze plus optional test/lint commands.
- `build`: file edits allowed with approval.
- `debug`: commands and edits allowed with approval.
- `refactor`: edits allowed with stricter diff review.

Default mode: `plan`.

## 5. Architecture

```text
src/modules/agents/
├─ agent-types.ts
├─ agent-store.ts
├─ agent-runtime.ts
├─ opencode-runtime.ts
├─ agent-session-manager.ts
├─ agent-prompts.ts
└─ components/
   ├─ agent-chat-toggle.tsx
   ├─ agent-controls-row.tsx
   ├─ agent-mode-selector.tsx
   ├─ agent-status-bar.tsx
   ├─ agent-activity-stream.tsx
   └─ agent-change-review.tsx

src-tauri/src/
├─ agent_commands.rs
└─ opencode_process.rs
```

Only the Agents module should know about opencode details. Normal chat code should only know whether the chat shell is currently in `chat` or `agents` mode and delegate agent sends to the agent adapter.

The intended boundary is:

```text
chat-panel.tsx
  owns: toggle UI, composer shell, timeline placement
  does not own: opencode process, agent permissions, session persistence

src/modules/agents/*
  owns: agent state, runtime calls, opencode bridge, agent events
  does not own: normal provider chat flow
```

## 6. Runtime Boundary

Define a generic runtime interface first. Opencode is the first implementation, not the app-level abstraction.

```ts
export type AgentMode = "plan" | "review" | "build" | "debug" | "refactor";

export type AgentStatus =
  | "idle"
  | "checking_runtime"
  | "starting"
  | "running"
  | "waiting_for_permission"
  | "completed"
  | "failed"
  | "stopped";

export type AgentSession = {
  id: string;
  runtime: "opencode";
  mode: AgentMode;
  status: AgentStatus;
  projectPath: string;
  prompt: string;
  processId?: number;
  startedAt: string;
  endedAt?: string;
  events: AgentEvent[];
  changedFiles: string[];
  commandsRun: string[];
  summary?: string;
};

export interface AgentRuntime {
  id: string;
  name: string;
  isAvailable(): Promise<boolean>;
  start(input: StartAgentSessionInput): Promise<AgentSession>;
  stop(sessionId: string): Promise<void>;
}
```

The frontend session manager talks to `AgentRuntime`. The opencode runtime translates that interface into Tauri commands. The chat UI should call a narrow adapter such as `sendAgentMessage(input)` rather than importing opencode-specific code.

## 7. Opencode Background Runtime

The MVP should launch opencode as a hidden background process from Tauri, not an embedded terminal UI.

```text
Veyra Chat Shell With Agents Toggle On
    -> invoke("start_opencode_agent", input)
    -> Rust process bridge
    -> opencode CLI process
    -> stdout/stderr/events streamed back to Veyra
```

The user should see Veyra's agent session card and activity drawer, not an opencode TUI, unless they explicitly choose `Open in terminal` later.

### 7.1 Process Rules

- Spawn opencode only for an active agent session.
- Set current working directory to the selected project path.
- Capture stdout and stderr.
- Emit output to the frontend as session events.
- Kill the child process when the session stops.
- Kill child processes on app shutdown.
- Never keep a global opencode process alive after all agent sessions stop.

### 7.2 MVP Command Shape

Use a one-shot CLI run first:

```text
opencode run --agent plan "<prompt>"
```

If opencode's installed CLI expects a different command shape, keep that difference inside `opencode_process.rs` and `opencode-runtime.ts`.

## 8. Session Events

Veyra should render structured events even if the MVP derives them from stdout/stderr.

```ts
export type AgentEvent =
  | { type: "status"; message: string; at: string }
  | { type: "output"; stream: "stdout" | "stderr"; text: string; at: string }
  | { type: "command"; command: string; at: string }
  | { type: "file_changed"; path: string; at: string }
  | { type: "permission_request"; request: AgentPermissionRequest; at: string }
  | { type: "error"; message: string; at: string };
```

MVP event parsing can be simple:

- All stdout becomes `output`.
- All stderr becomes `output` or `error` if the process exits non-zero.
- Git diff after completion becomes `file_changed` events.
- Permission events can wait until a protocol/server integration exists.

## 9. Permission Model

Veyra should default to safe behavior by mode.

```text
plan
read: allow
edit: deny
commands: ask

review
read: allow
edit: deny
commands: ask

build
read: allow
edit: ask
commands: ask

debug
read: allow
edit: ask
commands: ask

refactor
read: allow
edit: ask
commands: ask
```

For the CLI MVP, use opencode permission configuration and a conservative command choice. Veyra's own interactive permission gateway can come later when the runtime supports permission requests as structured events.

## 10. Project Context

Until a full project system exists, Agents Mode should accept a workspace path.

```ts
export type AgentProjectContext = {
  projectPath: string;
  projectName?: string;
  packageManager?: "npm" | "pnpm" | "bun" | "yarn" | "cargo" | "unknown";
  buildCommand?: string;
  testCommand?: string;
  lintCommand?: string;
  memorySummary?: string;
};
```

Do not block the MVP on a full project database. Start with a path picker/manual path, then promote recent paths into projects later.

## 11. Memory Integration

Agent sessions and normal chat conversations stay separate.

Normal chat may include a compact reference to an agent session:

```text
Agent session completed: Plan for Veyra agent mode.
Session: <agent-session-id>
Summary: <short summary>
```

Do not copy raw opencode transcripts into normal chat history by default.

After a session completes, Veyra can suggest memories from:

- Decisions made.
- Files changed.
- Commands that worked.
- Project conventions discovered.
- Follow-up tasks.

The memory write should go through the existing Veyra memory flow, not opencode memory.

## 12. File Change Review

For MVP, use Git when available:

```text
Before session: record git status / diff baseline.
After session: show changed files from git diff.
```

If the workspace is not a Git repo, show a simpler warning:

```text
File change review is limited because this folder is not a Git repository.
```

The review panel should show:

- Changed files.
- Commands run, if detected.
- Process exit code.
- Final summary.
- Button to open the folder externally.

Do not implement automatic revert in the first pass unless there is a reliable snapshot mechanism.

## 13. Tauri Commands

Add a focused command surface:

```rust
#[tauri::command]
async fn check_opencode_available() -> Result<bool, String>;

#[tauri::command]
async fn start_opencode_agent(input: StartOpencodeAgentInput) -> Result<AgentProcessHandle, String>;

#[tauri::command]
async fn stop_opencode_agent(session_id: String) -> Result<(), String>;
```

Use Tauri events for streaming output:

```text
agent://event
agent://exit
```

Keep process ownership in Rust so the frontend cannot orphan child processes.

## 14. State Store

Create a separate agent store rather than extending `chat-store.ts`.

```ts
type AgentStore = {
  sessions: AgentSession[];
  activeSessionId: string | null;
  runtimeAvailable: boolean | null;
  checkRuntime: () => Promise<void>;
  startSession: (input: StartAgentSessionInput) => Promise<void>;
  stopSession: (sessionId: string) => Promise<void>;
  appendEvent: (sessionId: string, event: AgentEvent) => void;
};
```

Persist sessions separately from normal conversations. A later migration can add encryption if needed; the MVP can mirror the existing conversation persistence pattern.

## 15. Implementation Plan

### Phase 1: Chat Toggle With Separated Agent Module

- Add `src/modules/agents/agent-types.ts`.
- Add `src/modules/agents/agent-store.ts`.
- Add chat-level `Chat / Agents` toggle UI.
- Add agent controls row with mode selector, workspace path input, status, and runtime availability.
- Add agent session cards to the existing chat timeline.
- Keep normal chat send behavior untouched when the toggle is set to `Chat`.

### Phase 2: Runtime Availability

- Add `agent_commands.rs` and register it in `src-tauri/src/lib.rs`.
- Implement `check_opencode_available` by running `opencode --version` or equivalent.
- Show unavailable state in the agent controls row with setup guidance.

### Phase 3: Background Launch MVP

- Implement `start_opencode_agent` as a child process bridge.
- Stream stdout/stderr to frontend events.
- Implement `stop_opencode_agent`.
- Stop active agent processes on app shutdown.
- Support `plan` mode first.

### Phase 4: Session Review

- Record session events.
- Track exit code and final status.
- Use Git diff to show changed files after completion.
- Persist agent session summaries separately from chat.

### Phase 5: Safer Build Modes

- Add `review`, then `build`, `debug`, and `refactor`.
- Add mode-specific prompts and opencode agent mapping.
- Add explicit warnings for modes that can edit files.

### Phase 6: Protocol Upgrade

- Replace stdout parsing with opencode server/protocol events if available.
- Add structured permission requests.
- Add richer diff and command review.
- Add session resume.

## 16. Non-Goals For MVP

- Do not replace normal chat with opencode.
- Do not embed the opencode TUI by default.
- Do not build a full project system first.
- Do not implement multi-agent parallel sessions first.
- Do not auto-save raw transcripts into memory.
- Do not add automatic revert without snapshots.
- Do not require opencode for the app to launch.

## 17. Acceptance Criteria

MVP is complete when:

- The chat UI has a clear `Chat / Agents` toggle.
- Normal chat works without opencode installed.
- Agents mode can detect whether opencode is available.
- Starting a `plan` session launches opencode in the background.
- Output streams back into Veyra's activity stream.
- Stopping a session stops the opencode process.
- App shutdown cleans up agent child processes.
- Agent sessions are stored separately from normal chat conversations.
- The implementation keeps opencode behind the Agents module boundary.
