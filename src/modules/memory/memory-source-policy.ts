type MemorySource = { sourceType: "chat" | "agent"; sourceId: string; projectId?: string };
let validateSource: (source: MemorySource) => boolean = () => false;

export function isKnownMemorySource(source: MemorySource): boolean {
  return validateSource(source);
}

/** Reconcile against durable source stores after restart, even if a prior purge failed. */
export async function prepareMemorySourceValidation(): Promise<boolean> {
  try {
    const [{ useChatStore }, { useAgentStore }, { useProjectStore }, { getConversationStorageIssue }] = await Promise.all([
      import("@/stores/chat-store"),
      import("@/modules/agents/agent-store"),
      import("@/modules/projects/project-store"),
      import("@/lib/conversation-storage"),
    ]);
    await Promise.all([
      useChatStore.getState().hydrateConversations(),
      useProjectStore.getState().hydrateProjects(),
    ]);
    if (getConversationStorageIssue()?.severity === "error") {
      validateSource = () => false;
      return false;
    }
    validateSource = (source) => {
      if (source.projectId && !useProjectStore.getState().projects.some((project) => project.id === source.projectId)) return false;
      if (source.sourceId === "manual") return true;
      return source.sourceType === "chat"
        ? useChatStore.getState().conversations.some((conversation) => conversation.id === source.sourceId)
        : useAgentStore.getState().sessions.some((session) => session.id === source.sourceId);
    };
    return true;
  } catch {
    validateSource = () => false;
    return false;
  }
}
