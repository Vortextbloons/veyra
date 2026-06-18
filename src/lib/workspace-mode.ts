import { useCallback } from "react";
import type { ChatMode } from "@/modules/chat/chat-types";
import { useSettingsStore } from "@/stores/settings-store";

/** Maps mode-selector choices to primary nav + in-chat workspace mode. */
export function useWorkspaceModeChange() {
  const setActiveNav = useSettingsStore((s) => s.setActiveNav);
  const setWorkspaceChatMode = useSettingsStore((s) => s.setWorkspaceChatMode);

  return useCallback(
    (mode: ChatMode) => {
      if (mode === "research") {
        setActiveNav("research");
        return;
      }
      if (mode === "characters") {
        setActiveNav("characters");
        return;
      }
      setActiveNav("chat");
      setWorkspaceChatMode(mode);
    },
    [setActiveNav, setWorkspaceChatMode],
  );
}
