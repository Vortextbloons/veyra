import type { PrimarySidebarProps } from "@/modules/chat/chat-types";

const NAV: { id: string; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "characters", label: "Characters" },
  { id: "projects", label: "Projects" },
  { id: "documents", label: "Documents" },
  { id: "research", label: "Research" },
  { id: "memory", label: "Memory" },
  { id: "settings", label: "Settings" },
];

export function PrimarySidebar({ activeNav, onNavChange, onNewChat }: PrimarySidebarProps) {
  return (
    <aside className="primary-sidebar flex h-full w-[188px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[#0d0e13] max-[960px]:w-[64px]">
      <div className="flex items-center gap-2.5 px-4 pb-5 pt-5 max-[960px]:justify-center max-[960px]:px-2">
        <div className="grid size-7 place-items-center rounded-md border border-[var(--color-border-strong)] bg-white/[0.04]">
          <span className="text-[12px] font-semibold text-[var(--color-accent)]">V</span>
        </div>
        <span className="text-[15px] font-semibold tracking-tight max-[960px]:hidden">
          Veyra
        </span>
      </div>

      <div className="px-3 max-[960px]:px-2">
        <button type="button" aria-label="New chat" onClick={onNewChat} className="flex min-h-9 w-full items-center justify-start rounded-md border border-[var(--color-border-strong)] bg-white/[0.025] px-3 py-2 text-[13px] font-medium text-[var(--color-text)] hover:border-white/15 hover:bg-white/[0.05] max-[960px]:justify-center max-[960px]:px-2">
          <span className="flex items-center gap-2">
            <span className="text-base leading-none">+</span>
            <span className="max-[960px]:hidden">New chat</span>
          </span>
        </button>
      </div>

      <nav aria-label="Workspace" className="mt-5 flex-1 px-2">
        {NAV.map((item) => {
          const active = item.id === activeNav;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              onClick={() => onNavChange?.(item.id)}
              className={`relative flex min-h-9 w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors max-[960px]:justify-center max-[960px]:px-2 ${
                active
                  ? "bg-white/[0.045] text-white before:absolute before:left-0 before:h-4 before:w-0.5 before:rounded-full before:bg-[var(--color-accent)]"
                  : "text-[var(--color-text-dim)] hover:bg-white/[0.025] hover:text-[var(--color-text)]"
              }`}
            >
              <span className="max-[960px]:hidden">{item.label}</span>
            </button>
          );
        })}
      </nav>

    </aside>
  );
}
