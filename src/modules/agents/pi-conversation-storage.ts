import { useAgentStore } from "./agent-store";
import { useChatStore } from "@/stores/chat-store";
import { saveConversationSnapshot } from "@/lib/conversation-storage";
import { buildAgentChatTurns } from "./agent-chat-turns";
import type { ChatMessage, Conversation } from "@/modules/chat/chat-types";

let initialized = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let savedSessions = useAgentStore.getState().sessions;

export function flushPiConversations(): void {
  if (!initialized) return;
  if (timer) clearTimeout(timer);
  timer = undefined;
  const sessions = useAgentStore.getState().sessions;
  if (sessions === savedSessions) return;
  const previousIds = new Set(savedSessions.map((session) => session.sourceConversationId ?? session.id));
  const ids = new Set(sessions.map((session) => session.sourceConversationId ?? session.id));
  const chat = useChatStore.getState();
  const conversations = chat.conversations.filter((conversation) => !previousIds.has(conversation.id) || ids.has(conversation.id));
  for (const session of sessions) {
    if (savedSessions.includes(session) && conversations.some((conversation) => conversation.agentSession?.id === session.id)) continue;
    const id = session.sourceConversationId ?? session.id;
    const existing = conversations.find((conversation) => conversation.id === id);
    const existingMessages = new Map(existing?.messages.map((message) => [message.id, message]));
    const eventTimes = new Map(session.events.map((event) => [event.id, event.at]));
    const previousSession = savedSessions.find((item) => item.id === session.id);
    const messages: ChatMessage[] = existing && existing.messages.length > 0 && previousSession?.events === session.events && previousSession.model === session.model ? existing.messages : buildAgentChatTurns(session.events, session.model).filter((turn) => !turn.kind).map((turn) => ({
      ...existingMessages.get(turn.id),
      id: turn.id, role: turn.role === "user" ? "user" : "assistant", content: turn.content,
      reasoning: turn.reasoning,
      timestamp: eventTimes.get(turn.id) ?? session.startedAt,
      modelId: turn.model, attachments: turn.attachments, artifact: turn.artifact, interactiveAnswer: turn.interactiveAnswer,
    }));
    const conversation: Conversation = { ...existing, id, title: session.title, messages, createdAt: existing?.createdAt ?? session.startedAt, updatedAt: session.endedAt ?? Date.now(), projectId: session.projectId, agentSession: { ...session, status: session.status === "running" ? "stopped" : session.status } };
    const index = conversations.findIndex((item) => item.id === id);
    if (index >= 0) conversations[index] = conversation;
    else conversations.unshift(conversation);
  }
  savedSessions = sessions;
  useChatStore.setState({ conversations });
  void saveConversationSnapshot(conversations);
}

/** Called once after encrypted history has hydrated. Keeps legacy agent sessions. */
export function initializePiConversations(): void {
  if (initialized) return;
  const restored = useChatStore.getState().conversations.flatMap((conversation) => conversation.agentSession ? [conversation.agentSession] : []);
  const existing = useAgentStore.getState().sessions;
  const restoredIds = new Set(restored.map((session) => session.id));
  const unsaved = existing.filter((session) => !restoredIds.has(session.id));
  const sessions = [...restored, ...unsaved];
  useAgentStore.setState({ sessions });
  // Restored transcripts already match their encrypted snapshots. Only flush
  // sessions that have not yet been saved; do not rebuild or rewrite history.
  savedSessions = unsaved.length ? restored : sessions;
  initialized = true;
  flushPiConversations();
  useAgentStore.subscribe((state, previous) => {
    if (state.sessions === previous.sessions) return;
    const terminalChange = state.sessions.length !== previous.sessions.length || state.sessions.some((session) => session.status !== "running" && !previous.sessions.includes(session));
    if (terminalChange) flushPiConversations();
    else if (!timer) timer = setTimeout(flushPiConversations, 2000);
  });
}
