import { useCallback, useEffect, useMemo } from "react";
import { useAgentStore } from "@/modules/agents/agent-store";

interface UseAgentDispatchOptions {
  workspaceChatMode: "chat" | "research" | "agents";
}

export function useAgentDispatch({
  workspaceChatMode,
}: UseAgentDispatchOptions) {
  const agentSessions = useAgentStore((state) => state.sessions);
  const activeAgentSessionId = useAgentStore((state) => state.activeSessionId);
  const agentRuntimeAvailable = useAgentStore((state) => state.runtimeAvailable);
  const agentMode = useAgentStore((state) => state.mode);
  const agentProjectPath = useAgentStore((state) => state.projectPath);
  const setAgentMode = useAgentStore((state) => state.setMode);
  const setAgentProjectPath = useAgentStore((state) => state.setProjectPath);
  const setActiveAgentSessionId = useAgentStore((state) => state.setActiveSessionId);
  const checkAgentRuntime = useAgentStore((state) => state.checkRuntime);
  const loadAgentProjectSessions = useAgentStore((state) => state.loadProjectSessions);
  const newAgentSession = useAgentStore((state) => state.newSession);
  const startAgentSession = useAgentStore((state) => state.startSession);
  const stopAgentSession = useAgentStore((state) => state.stopSession);
  const deleteAgentSession = useAgentStore((state) => state.deleteSession);
  const clearAgentSessions = useAgentStore((state) => state.clearSessions);

  const agentProjectKey = agentProjectPath.trim();
  const visibleAgentSessions = useMemo(
    () => agentSessions.filter((session) => session.projectPath.trim() === agentProjectKey),
    [agentProjectKey, agentSessions],
  );

  const activeAgentSession = useMemo(
    () =>
      visibleAgentSessions.find((session) => session.id === activeAgentSessionId) ??
      visibleAgentSessions[0] ??
      null,
    [activeAgentSessionId, visibleAgentSessions],
  );

  useEffect(() => {
    if (workspaceChatMode === "agents" && agentRuntimeAvailable == null) {
      void checkAgentRuntime();
    }
  }, [agentRuntimeAvailable, workspaceChatMode, checkAgentRuntime]);

  useEffect(() => {
    if (workspaceChatMode !== "agents") return;
    void loadAgentProjectSessions(agentProjectPath);
  }, [agentProjectPath, workspaceChatMode, loadAgentProjectSessions]);

  const handleAgentSessionSelect = useCallback(
    (id: string) => {
      setActiveAgentSessionId(id);
    },
    [setActiveAgentSessionId],
  );

  return {
    agentSessions,
    activeAgentSessionId,
    agentRuntimeAvailable,
    agentMode,
    agentProjectPath,
    setAgentMode,
    setAgentProjectPath,
    setActiveAgentSessionId,
    checkAgentRuntime,
    loadAgentProjectSessions,
    newAgentSession,
    startAgentSession,
    stopAgentSession,
    deleteAgentSession,
    clearAgentSessions,
    agentProjectKey,
    visibleAgentSessions,
    activeAgentSession,
    handleAgentSessionSelect,
  };
}
