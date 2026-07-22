import { useMemo } from "react";
import { useMemoryStore, selectVisibleNodes } from "@/modules/memory/memory-store";
import { useMemoryUi, type MemoryView } from "./memory-ui-context";
import { calculateProfileCompleteness } from "@/modules/memory/profile-helpers";

const VIEWS: { id: MemoryView; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "all", label: "All" },
  { id: "inbox", label: "Inbox" },
  { id: "pinned", label: "Pinned" },
  { id: "permanent", label: "Permanent" },
  { id: "low_priority", label: "Low Priority" },
  { id: "recent", label: "Recent" },
  { id: "archived", label: "Archived" },
];

export function MemorySidebar() {
  const { activeView, setActiveView, query } = useMemoryUi();
  const nodes = useMemoryStore((s) => s.nodes);
  const folders = useMemoryStore((s) => s.folders);

  const profileCompleteness = useMemo(() => calculateProfileCompleteness(nodes), [nodes]);

  const counts = useMemo<Record<MemoryView, number>>(() => ({
    profile: profileCompleteness,
    all: selectVisibleNodes({ nodes }, "all", "").length,
    inbox: selectVisibleNodes({ nodes }, "inbox", "").length,
    pinned: selectVisibleNodes({ nodes }, "pinned", "").length,
    permanent: selectVisibleNodes({ nodes }, "permanent", "").length,
    low_priority: selectVisibleNodes({ nodes }, "low_priority", "").length,
    recent: selectVisibleNodes({ nodes }, "recent", query).length,
    archived: selectVisibleNodes({ nodes }, "archived", "").length,
  }), [nodes, query, profileCompleteness]);

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
                <span>{v.label}</span>
                <span className="font-mono text-[10.5px] text-[var(--color-text-dim)]">
                  {v.id === "profile" ? `${counts[v.id]}%` : counts[v.id]}
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
