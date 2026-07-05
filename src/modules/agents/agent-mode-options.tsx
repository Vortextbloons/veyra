import type { ReactNode } from "react";
import { Hammer, ListTodo } from "lucide-react";
import type { AgentMode } from "@/modules/agents/agent-types";

export const AGENT_MODES: { id: AgentMode; label: string; detail: string; icon: ReactNode }[] = [
  { id: "plan", label: "Plan", detail: "Read-only analysis & strategy", icon: <ListTodo className="size-3.5" /> },
  { id: "build", label: "Build", detail: "Take action on your machine", icon: <Hammer className="size-3.5" /> },
];
