import type { AgentMode } from "@/modules/agents/agent-types";

export const AGENT_MODES: { id: AgentMode; label: string; detail: string }[] = [
  { id: "plan", label: "Plan", detail: "Read-only analysis & strategy" },
  { id: "build", label: "Build", detail: "Take action on your machine" },
];
