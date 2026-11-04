import { useCallback, useEffect, useMemo } from "react";
import { useAgentStore } from "@/modules/agents/agent-store";

export function useAgentDispatch() {
  const agentSessions = useAgentStore((state) => state.sessions);
  const activeAgentSessionId = useAgentStore((state) => state.activeSessionId);
  const agentRuntimeAvailable = useAgentStore((state) => state.runtimeAvailable);
  const agentProjectPath = useAgentStore((state) => state.projectPath);
  const setAgentProjectPath = useAgentStore((state) => state.setProjectPath);
  const setActiveAgentSessionId = useAgentStore((state) => state.setActiveSessionId);
  const checkAgentRuntime = useAgentStore((state) => state.checkRuntime);
  const loadAgentProjectSessions = useAgentStore((state) => state.loadProjectSessions);
  const newAgentSession = useAgentStore((state) => state.newSession);
  const stopAgentSession = useAgentStore((state) => state.stopSession);
  const deleteAgentSession = useAgentStore((state) => state.deleteSession);

  const agentProjectKey = agentProjectPath.trim();
  const visibleAgentSessions = useMemo(
    () => agentSessions.filter((session) => session.projectPath.trim() === agentProjectKey),
    [agentProjectKey, agentSessions],
  );

  const activeAgentSession = useMemo(
    () =>
      visibleAgentSessions.find((session) => session.id === activeAgentSessionId) ??
      null,
    [activeAgentSessionId, visibleAgentSessions],
  );

  useEffect(() => {
    if (agentRuntimeAvailable == null) {
      void checkAgentRuntime();
    }
  }, [agentRuntimeAvailable, checkAgentRuntime]);

  useEffect(() => {
    void loadAgentProjectSessions(agentProjectPath);
  }, [agentProjectPath, loadAgentProjectSessions]);

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
    agentProjectPath,
    setAgentProjectPath,
    setActiveAgentSessionId,
    checkAgentRuntime,
    loadAgentProjectSessions,
    newAgentSession,
    stopAgentSession,
    deleteAgentSession,
    agentProjectKey,
    visibleAgentSessions,
    activeAgentSession,
    handleAgentSessionSelect,
  };
}
