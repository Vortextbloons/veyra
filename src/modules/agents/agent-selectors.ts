import type { AgentSession, AgentMode, AgentStatus, StartAgentSessionInput } from "./agent-types";

type AgentState = {
  sessions: AgentSession[];
  activeSessionId: string | null;
  runtimeAvailable: boolean | null;
  runtimeStatus: AgentStatus;
  mode: AgentMode;
  projectPath: string;
  selectedModel: string;
  setMode: (mode: AgentMode) => void;
  setProjectPath: (projectPath: string) => void;
  setSelectedModel: (model: string) => void;
  setActiveSessionId: (id: string | null) => void;
  checkRuntime: () => Promise<void>;
  loadProjectSessions: (projectPath: string) => Promise<void>;
  newSession: () => void;
  deleteSession: (sessionId: string) => Promise<void>;
  startSession: (input: StartAgentSessionInput) => Promise<string>;
  stopSession: (id: string) => void;
  clearSessions: () => void;
};

export const selectSessions = (s: AgentState) => s.sessions;
export const selectActiveSessionId = (s: AgentState) => s.activeSessionId;
export const selectRuntimeAvailable = (s: AgentState) => s.runtimeAvailable;
export const selectRuntimeStatus = (s: AgentState) => s.runtimeStatus;
export const selectMode = (s: AgentState) => s.mode;
export const selectProjectPath = (s: AgentState) => s.projectPath;
export const selectSelectedModel = (s: AgentState) => s.selectedModel;

export const selectSetMode = (s: AgentState) => s.setMode;
export const selectSetProjectPath = (s: AgentState) => s.setProjectPath;
export const selectSetSelectedModel = (s: AgentState) => s.setSelectedModel;
export const selectSetActiveSessionId = (s: AgentState) => s.setActiveSessionId;
export const selectCheckRuntime = (s: AgentState) => s.checkRuntime;
export const selectLoadProjectSessions = (s: AgentState) => s.loadProjectSessions;
export const selectNewSession = (s: AgentState) => s.newSession;
export const selectDeleteSession = (s: AgentState) => s.deleteSession;
export const selectStartSession = (s: AgentState) => s.startSession;
export const selectStopSession = (s: AgentState) => s.stopSession;
export const selectClearSessions = (s: AgentState) => s.clearSessions;
