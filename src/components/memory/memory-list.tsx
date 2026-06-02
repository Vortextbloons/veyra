import { Search } from "lucide-react";
import { useMemoryStore, selectVisibleNodes } from "@/stores/memory-store";
import type { MemoryView } from "@/stores/memory-store";
import { MemoryCard } from "./memory-card";

export function MemoryList() {
  const query = useMemoryStore((s) => s.query);
  const setQuery = useMemoryStore((s) => s.setQuery);
  const activeView = useMemoryStore((s) => s.activeView);
  const nodes = useMemoryStore((s) => s.nodes);
  const visible = selectVisibleNodes({ nodes }, activeView, query);

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-dim)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memories…"
            className="h-7 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] pl-7 pr-2 text-[12.5px] text-white placeholder:text-[var(--color-text-dim)]/70 focus:border-[var(--color-accent)]/40 focus:outline-none"
          />
        </div>
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-[var(--color-text-dim)]">
          {visible.length} {visible.length === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {visible.length === 0 ? (
          <EmptyState view={activeView} />
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map((node) => (
              <MemoryCard key={node.id} node={node} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyState({ view }: { view: MemoryView }) {
  const message =
    view === "inbox"
      ? "Inbox is empty."
      : view === "pinned"
      ? "No pinned memories."
      : view === "recent"
      ? "No recent memories."
      : view === "archived"
      ? "No archived memories."
      : "No memories yet — click +New Memory to create one.";
  return (
    <div className="grid h-full place-items-center text-center">
      <div>
        <div className="mx-auto mb-3 grid size-10 place-items-center rounded-2xl bg-white/[0.03] ring-1 ring-inset ring-[var(--color-border)]">
          <Search className="size-4 text-[var(--color-text-dim)]" />
        </div>
        <p className="text-[12.5px] text-[var(--color-text-dim)]">{message}</p>
      </div>
    </div>
  );
}
