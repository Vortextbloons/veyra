import type { StateCreator } from "zustand";
import type { WorkspaceChatMode } from "@/modules/chat/chat-types";

export type ChatSliceState = {
  workspaceChatMode: WorkspaceChatMode;
  contextAnchoringEnabled: boolean;
};

export type ChatSliceActions = {
  setWorkspaceChatMode: (mode: WorkspaceChatMode) => void;
  setContextAnchoringEnabled: (enabled: boolean) => void;
};

export const DEFAULT_CHAT_STATE: ChatSliceState = {
  workspaceChatMode: "chat",
  contextAnchoringEnabled: true,
};

export type ChatSlice = ChatSliceState & ChatSliceActions;

export const createChatSlice: StateCreator<ChatSlice, [], [], ChatSlice> = (set) => ({
  ...DEFAULT_CHAT_STATE,
  setWorkspaceChatMode: (workspaceChatMode) => set({ workspaceChatMode }),
  setContextAnchoringEnabled: (contextAnchoringEnabled) => set({ contextAnchoringEnabled }),
});
