import { useChatPipeline } from "@/hooks/use-chat-pipeline";

/**
 * Self-contained chat pipeline state and message handlers. Used by the
 * Characters page so it can mount a real ChatPanel that sends to the active
 * model and shares the same `useChatStore` as the main app.
 *
 * Only one of these should be mounted at a time — App.tsx hides its own
 * ChatPanel when `activeNav === "characters"`, and this hook drives the
 * ChatPanel rendered inside the CharacterPage.
 *
 * Delegates to the shared `useChatPipeline` hook with no project scoping
 * and agent mode disabled.
 */
export function useCharacterChatPipeline() {
  return useChatPipeline();
}
