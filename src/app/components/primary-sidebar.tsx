import type { PrimarySidebarProps } from "@/modules/chat/chat-types";
import type { ReactNode } from "react";
import { Bot, Brain, FileText, Folder, MessageCircle, Search, Settings, SquarePen, Users, type LucideIcon } from "lucide-react";

const NAV: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "characters", label: "Characters", icon: Users },
  { id: "projects", label: "Projects", icon: Folder },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "research", label: "Research", icon: Search },
  { id: "memory", label: "Memory", icon: Brain },
];

export function PrimarySidebar({ activeNav, onNavChange, onNewChat, children, compact = false }: PrimarySidebarProps & { children?: ReactNode; compact?: boolean }) {
  return (
    <aside className={`primary-sidebar ${compact ? "agent-app-rail" : ""} flex h-full w-[272px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] max-[760px]:w-[64px]`}>
      <div className="flex h-16 shrink-0 items-center px-5 max-[760px]:justify-center max-[760px]:px-2">
        <span className="text-[20px] font-semibold tracking-tight max-[760px]:hidden">
          Veyra
        </span>
        <span className="hidden text-lg font-semibold max-[760px]:block">V</span>
      </div>

      <div className="px-3 max-[760px]:px-2">
        <button type="button" aria-label={compact ? "New agent session" : "New chat"} onClick={onNewChat} className="flex min-h-11 w-full items-center justify-start rounded-xl bg-white/[0.07] px-3 py-2 text-[14px] text-[var(--color-text)] transition-colors hover:bg-white/10 max-[760px]:justify-center max-[760px]:px-2">
          <span className="flex items-center gap-2">
            <SquarePen className="size-[18px]" />
            <span className="max-[760px]:hidden">New chat</span>
          </span>
        </button>
      </div>

      <nav aria-label="Workspace" className="mt-2 shrink-0 px-3 max-[760px]:px-2">
        {NAV.map((item) => {
          const active = item.id === activeNav;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              onClick={() => onNavChange?.(item.id)}
              className={`relative flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-[14px] transition-colors max-[760px]:justify-center max-[760px]:px-2 ${
                active
                  ? "bg-white/[0.07] text-white"
                  : "text-[var(--color-text-dim)] hover:bg-white/[0.025] hover:text-[var(--color-text)]"
              }`}
            >
              <item.icon className="size-[18px] shrink-0" />
              <span className="max-[760px]:hidden">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="mt-6 flex min-h-0 flex-1 flex-col">{children}</div>
      <button type="button" aria-label="Settings" aria-current={activeNav === "settings" ? "page" : undefined} onClick={() => onNavChange?.("settings")} className={`m-3 flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors hover:bg-white/[0.07] max-[760px]:mx-2 max-[760px]:justify-center max-[760px]:px-2 ${activeNav === "settings" ? "bg-white/[0.07] text-white" : "text-[var(--color-text-dim)]"}`}>
        <Settings className="size-[18px]" />
        <span className="max-[760px]:hidden">Settings</span>
      </button>
    </aside>
  );
}
