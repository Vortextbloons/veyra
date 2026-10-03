import { useState } from "react";
import { MessageSquare, PanelLeftClose, PanelLeftOpen, Search, Trash2 } from "lucide-react";
import type { RecentChatsProps } from "@/modules/chat/chat-types";

function StudioChatBadge() {
  return (
    <span
      className="shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-violet-200"
      aria-label="Studio conversation"
      title="Studio chat"
    >
      Studio
    </span>
  );
}

export function RecentChats({
  chats = [],
  activeId,
  onSelect,
  onDelete,
  onDeleteAll,
  collapsed: collapsedProp,
  onCollapsedChange,
  hidden,
}: RecentChatsProps) {
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const visibleChats = chats.filter((chat) => chat.title.toLowerCase().includes(query.toLowerCase()));
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const collapsed = collapsedProp ?? collapsedInternal;
  const setCollapsed = (value: boolean) => {
    onCollapsedChange?.(value);
    if (collapsedProp === undefined) setCollapsedInternal(value);
  };

  if (hidden) return null;

  return (
    <aside
      className={`flex min-h-0 w-full flex-col overflow-hidden bg-[var(--color-surface)] ${collapsed ? "shrink-0" : "flex-1"}`}
      aria-hidden={hidden}
    >
      {collapsed ? (
        <div className="flex items-center px-3">
          <button
            type="button"
            aria-label="Expand recent chats"
            aria-expanded={false}
            onClick={() => setCollapsed(false)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            <PanelLeftOpen className="size-4" />
            <span className="max-[760px]:hidden">Show chats</span>
          </button>
        </div>
      ) : (
        <>
      <div className="flex items-center justify-between gap-1 px-3 pb-3 pt-4 max-[760px]:justify-center max-[760px]:px-1">
        <h2 className="min-w-0 truncate text-[13px] font-medium text-[var(--color-text)] max-[760px]:hidden">
          Chats
        </h2>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            aria-label="Search chats"
            aria-expanded={searchOpen}
            onClick={() => { setSearchOpen(!searchOpen); setQuery(""); }}
            className="grid size-6 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white max-[760px]:hidden"
          >
            <Search className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Collapse recent chats"
            aria-expanded={true}
            onClick={() => setCollapsed(true)}
            className="grid size-6 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            <PanelLeftClose className="size-3.5" />
          </button>
        </div>
      </div>

      {searchOpen && <div className="px-3 pb-3 max-[760px]:hidden"><input autoFocus aria-label="Search chat titles" placeholder="Search chats…" value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-[13px]" /></div>}

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {visibleChats.length === 0 ? (
          query.trim() ? <p className="px-4 py-6 text-[13px] text-[var(--color-text-dim)]">No chats match your search.</p> : <EmptyChats />
        ) : (
          <ul className="space-y-0.5">
            {visibleChats.map((chat) => {
              const active = chat.id === activeId;
              const isStudio = chat.experience === "studio";
              return (
                <li key={chat.id} className="group">
                  <div
                    className={`flex w-full items-center gap-0.5 rounded-md transition-colors ${
                      active
                        ? "bg-[var(--color-accent-soft)]"
                        : "hover:bg-white/5"
                    }`}
                  >
                    <button
                      onClick={() => onSelect?.(chat.id)}
                      title={chat.title}
                      aria-label={chat.title}
                      aria-current={active ? "true" : undefined}
                      className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left max-[760px]:justify-center max-[760px]:px-1"
                    >
                      <MessageSquare className="size-4 shrink-0 text-[var(--color-text-dim)]" />
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 max-[760px]:hidden">
                        <span
                          className={`truncate text-[13px] leading-snug ${
                            active
                              ? "text-white"
                              : "text-[var(--color-text-dim)]"
                          }`}
                        >
                          {chat.title}
                        </span>
                        {isStudio && <StudioChatBadge />}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete "${chat.title}"`}
                      onClick={() => onDelete?.(chat.id)}
                      className="mr-1 grid size-7 shrink-0 place-items-center rounded opacity-0 transition-all group-hover:opacity-100 group-focus-within:opacity-100 text-[var(--color-text-dim)] hover:bg-red-500/10 hover:text-red-400 max-[760px]:hidden"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-[var(--color-border)] p-3 max-[760px]:hidden">
        {confirmDeleteAll ? (
          <DeleteAllConfirm
            count={chats.length}
            onCancel={() => setConfirmDeleteAll(false)}
            onConfirm={() => {
              onDeleteAll?.();
              setConfirmDeleteAll(false);
            }}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {chats.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmDeleteAll(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[11.5px] text-[var(--color-text-dim)] transition-colors hover:bg-red-500/[0.06] hover:text-red-400"
              >
                <Trash2 className="size-3" />
                Clear all chats
              </button>
            )}
          </div>
        )}
      </div>
        </>
      )}
    </aside>
  );
}

function DeleteAllConfirm({
  count,
  onCancel,
  onConfirm,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="rounded-md border border-red-500/20 bg-red-500/[0.04] p-3">
      <p className="mb-3 text-center text-[11.5px] leading-snug text-[var(--color-text-dim)]">
        Permanently delete{" "}
        <span className="font-medium text-[var(--color-text)]">
          {count} {count === 1 ? "chat" : "chats"}
        </span>
        ? This cannot be undone.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] py-1.5 text-[11.5px] text-[var(--color-text-dim)] hover:border-[var(--color-border-strong)] hover:text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 rounded-md bg-red-500/15 py-1.5 text-[11.5px] font-medium text-red-400 hover:bg-red-500/25"
        >
          Delete all
        </button>
      </div>
    </div>
  );
}

function EmptyChats() {
  return (
    <div className="grid h-full place-items-center px-6 text-center max-[760px]:hidden">
      <div>
        <div className="mx-auto mb-2 grid size-9 place-items-center rounded-lg bg-[var(--color-panel)] text-[var(--color-text-dim)]">
          <Search className="size-4" />
        </div>
        <p className="text-[12px] text-[var(--color-text-dim)]">
          No chats yet.
          <br />
          Start a new conversation.
        </p>
      </div>
    </div>
  );
}
