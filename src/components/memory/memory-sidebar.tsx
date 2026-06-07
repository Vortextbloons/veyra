import { useMemo, type ReactNode } from "react";
import { Database, Inbox, Pin, Clock, Archive, Globe, Folder, Shield, Hourglass } from "lucide-react";
import { useMemoryStore, selectVisibleNodes } from "@/stores/memory-store";
import type { MemoryView } from "@/stores/memory-store";

const VIEWS: { id: MemoryView; label: string; icon: ReactNode }[] = [
  { id: "all", label: "All", icon: <Database className="size-3.5" /> },
  { id: "inbox", label: "Inbox", icon: <Inbox className="size-3.5" /> },
  { id: "pinned", label: "Pinned", icon: <Pin className="size-3.5" /> },
  { id: "permanent", label: "Permanent", icon: <Shield className="size-3.5" /> },
  { id: "low_priority", label: "Low Priority", icon: <Hourglass className="size-3.5" /> },
  { id: "recent", label: "Recent", icon: <Clock className="size-3.5" /> },
  { id: "archived", label: "Archived", icon: <Archive className="size-3.5" /> },
];

export function MemorySidebar() {
  const activeView = useMemoryStore((s) => s.activeView);
  const setActiveView = useMemoryStore((s) => s.setActiveView);
  const query = useMemoryStore((s) => s.query);
  const nodes = useMemoryStore((s) => s.nodes);
  const folders = useMemoryStore((s) => s.folders);

  const counts = useMemo<Record<MemoryView, number>>(() => ({
    all: selectVisibleNodes({ nodes }, "all", "").length,
    inbox: selectVisibleNodes({ nodes }, "inbox", "").length,
    pinned: selectVisibleNodes({ nodes }, "pinned", "").length,
    permanent: selectVisibleNodes({ nodes }, "permanent", "").length,
    low_priority: selectVisibleNodes({ nodes }, "low_priority", "").length,
    recent: selectVisibleNodes({ nodes }, "recent", query).length,
    archived: selectVisibleNodes({ nodes }, "archived", "").length,
  }), [nodes, query]);

  return (
    <aside className="flex w-[200px] shrink-0 flex-col gap-4 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div>
        <div className="mb-1 px-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Views
        </div>
        <nav className="flex flex-col gap-0.5">
          {VIEWS.map((v) => {
            const active = activeView === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setActiveView(v.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[12.5px] transition-colors ${
                  active
                    ? "bg-[var(--color-accent-soft)] text-white"
                    : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2">
                  {v.icon}
                  {v.label}
                </span>
                <span className="font-mono text-[10.5px] text-[var(--color-text-dim)]">
                  {counts[v.id]}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <div>
        <div className="mb-1 px-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Scopes
        </div>
        <nav className="flex flex-col gap-0.5">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-white"
          >
            <Globe className="size-3.5" />
            Global
          </button>
          <div className="mt-1 flex flex-col gap-0.5">
            {folders.length === 0 ? (
              <span className="px-2 text-[11px] italic text-[var(--color-text-dim)]/60">
                (no projects yet)
              </span>
            ) : (
              folders.slice(0, 8).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-white"
                >
                  <Folder className="size-3.5" />
                  <span className="truncate">{f.name}</span>
                </button>
              ))
            )}
          </div>
        </nav>
      </div>
    </aside>
  );
}
