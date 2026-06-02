import { useState } from "react";
import { MessageSquare, PanelLeftClose, PanelLeftOpen, Search, Trash2 } from "lucide-react";
import type { RecentChatsProps } from "@/lib/chat-types";

export function RecentChats({
  chats = [],
  activeId,
  onSelect,
  onDelete,
  onDeleteAll,
  collapsed: collapsedProp,
  onCollapsedChange,
}: RecentChatsProps) {
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const collapsed = collapsedProp ?? collapsedInternal;
  const setCollapsed = (value: boolean) => {
    onCollapsedChange?.(value);
    if (collapsedProp === undefined) setCollapsedInternal(value);
  };

  return (
    <aside
      className={`flex h-full shrink-0 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-[width] duration-200 ease-out ${
        collapsed ? "w-11" : "w-[260px]"
      }`}
    >
      {collapsed ? (
        <div className="flex h-full flex-col items-center py-3">
          <button
            type="button"
            aria-label="Expand recent chats"
            aria-expanded={false}
            onClick={() => setCollapsed(false)}
            className="grid size-8 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            <PanelLeftOpen className="size-4" />
          </button>
          <div
            className="mt-3 flex flex-1 flex-col items-center gap-1 overflow-y-auto"
            title="Recent chats"
          >
            {chats.map((chat) => {
              const active = chat.id === activeId;
              return (
                <button
                  key={chat.id}
                  type="button"
                  aria-label={chat.title}
                  aria-current={active ? "true" : undefined}
                  onClick={() => onSelect?.(chat.id)}
                  className={`grid size-8 place-items-center rounded-md transition-colors ${
                    active
                      ? "bg-[var(--color-accent-soft)] text-white"
                      : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-white"
                  }`}
                >
                  <MessageSquare className="size-3.5" />
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <>
      <div className="flex items-center justify-between gap-1 px-3 pb-3 pt-4">
        <h2 className="min-w-0 truncate text-[13px] font-medium text-[var(--color-text)]">
          Recent Chats
        </h2>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            aria-label="Search chats"
            className="grid size-6 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
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

      <div className="flex-1 overflow-y-auto px-2">
        {chats.length === 0 ? (
          <EmptyChats />
        ) : (
          <ul className="space-y-0.5">
            {chats.map((chat) => {
              const active = chat.id === activeId;
              return (
                <li key={chat.id} className="group">
                  <div
                    className={`flex w-full items-center gap-0.5 rounded-md transition-colors ${
                      active
                        ? "bg-[var(--color-accent-soft)]"
                        : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <button
                      onClick={() => onSelect?.(chat.id)}
                      className="flex min-w-0 flex-1 items-start justify-between gap-2 px-3 py-2 text-left"
                    >
                      <span
                        className={`line-clamp-2 text-[12.5px] leading-snug ${
                          active
                            ? "text-white"
                            : "text-[var(--color-text-dim)]"
                        }`}
                      >
                        {chat.title}
                      </span>
                      <span className="shrink-0 pt-0.5 text-[10.5px] text-[var(--color-text-dim)] transition-opacity group-hover:opacity-0">
                        {chat.meta}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete "${chat.title}"`}
                      onClick={() => onDelete?.(chat.id)}
                      className="mr-1 grid size-7 shrink-0 place-items-center rounded opacity-0 transition-all group-hover:opacity-100 text-[var(--color-text-dim)] hover:bg-red-500/10 hover:text-red-400"
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

      <div className="border-t border-[var(--color-border)] p-3">
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
            <button className="flex w-full items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] py-1.5 text-[12px] text-[var(--color-text-dim)] hover:border-[var(--color-border-strong)] hover:text-white">
              View all chats
            </button>
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
    <div className="grid h-full place-items-center px-6 text-center">
      <div>
        <div className="mx-auto mb-2 grid size-9 place-items-center rounded-lg border border-dashed border-[var(--color-border-strong)] text-[var(--color-text-dim)]">
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
