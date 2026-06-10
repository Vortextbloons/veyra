import type { ReactNode } from "react";
import {
  Database,
  FlaskConical,
  Folder,
  Mail,
  MessageSquare,
  Settings,
  Sparkles,
} from "lucide-react";
import type { PrimarySidebarProps } from "@/lib/chat-types";

type NavItem = {
  id: string;
  label: string;
  icon: ReactNode;
};

const NAV: NavItem[] = [
  { id: "chat", label: "Chat", icon: <MessageSquare className="size-4" /> },
  { id: "projects", label: "Projects", icon: <Folder className="size-4" /> },
  { id: "research", label: "Research", icon: <FlaskConical className="size-4" /> },
  { id: "email", label: "Email", icon: <Mail className="size-4" /> },
  { id: "memory", label: "Memory", icon: <Database className="size-4" /> },
  { id: "settings", label: "Settings", icon: <Settings className="size-4" /> },
];

export function PrimarySidebar({ activeNav, onNavChange, onNewChat }: PrimarySidebarProps) {
  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
          <Sparkles className="size-4 text-white" />
        </div>
        <span className="text-[14px] font-semibold tracking-tight">
          Veyra
        </span>
      </div>

      <div className="px-3">
        <button type="button" onClick={onNewChat} className="flex w-full items-center justify-between rounded-lg bg-[var(--color-accent)] px-3 py-2 text-[13px] font-medium text-white hover:brightness-110">
          <span className="flex items-center gap-2">
            <span className="text-base leading-none">+</span>
            New Chat
          </span>
          <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-mono">
            ⌘K
          </span>
        </button>
      </div>

      <nav className="mt-4 flex-1 px-2">
        {NAV.map((item) => {
          const active = item.id === activeNav;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavChange?.(item.id)}
              className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors ${
                active
                  ? "bg-[var(--color-accent-soft)] text-white"
                  : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-[var(--color-text)]"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-[var(--color-border)] p-3">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/[0.03]">
          <div className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-amber-500 to-rose-500 text-[11px] font-semibold text-white">
            U
          </div>
          <div className="flex-1 text-left">
            <div className="text-[12px] font-medium">Personal</div>
            <div className="text-[10.5px] text-[var(--color-text-dim)]">
              Workspace
            </div>
          </div>
          <button
            type="button"
            aria-label="Settings"
            className="grid size-6 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            <Settings className="size-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
