# Agents Key Types

From `src/modules/agents/agent-types.ts`:

```typescript
type AgentMode = "plan" | "build";

type AgentRuntimeId = "pi";

type AgentStatus =
  | "idle" | "checking_runtime" | "ready" | "running"
  | "completed" | "failed" | "stopped";

type AgentEventType =
  | "status" | "reasoning" | "tool"
  | "output" | "error" | "result" | "token_update";

interface AgentSession {
  id: string;
  runtime: AgentRuntimeId;
  mode: AgentMode;
  status: AgentStatus;
  projectPath: string;
  prompt: string;
  model: string;
  piSessionId?: string;
  title: string;
  summary?: string;
  startedAt: number;
  endedAt?: number;
  events: AgentEvent[];
  exitCode?: number | null;
  contextTokens?: number;
}

interface AgentEvent {
  id: string;
  type: AgentEventType;
  title: string;
  detail?: string;
  at: number;
  sequence?: number;
  toolCallId?: string;
}

interface PiSession {
  id: string;
  title: string;
  updated: number;
  created: number;
  directory?: string;
}
```
