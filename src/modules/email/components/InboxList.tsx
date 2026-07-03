import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Archive,
  Loader2,
  MailOpen,
  Mail,
} from "lucide-react";
import { useEmailStore } from "../email-store";

export function InboxList() {
  const threads = useEmailStore((s) => s.threads);
  const activeThreadId = useEmailStore((s) => s.activeThreadId);
  const activeFolder = useEmailStore((s) => s.activeFolder);
  const isLoading = useEmailStore((s) => s.isLoading);
  const searchQuery = useEmailStore((s) => s.searchQuery);
  const selectThread = useEmailStore((s) => s.selectThread);
  const setSearchQuery = useEmailStore((s) => s.setSearchQuery);
  const loadThreads = useEmailStore((s) => s.loadThreads);
  const archiveThread = useEmailStore((s) => s.archiveThread);
  const markRead = useEmailStore((s) => s.markRead);
  const markUnread = useEmailStore((s) => s.markUnread);

  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (debounceTimer) clearTimeout(debounceTimer);
      const timer = setTimeout(() => {
        void loadThreads();
      }, 300);
      setDebounceTimer(timer);
    },
    [debounceTimer, setSearchQuery, loadThreads],
  );

  useEffect(() => {
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [debounceTimer]);

  return (
    <div className="flex w-[340px] min-w-[340px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)]">
      {/* Search bar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-3">
        <Search className="size-3.5 text-[var(--color-text-dim)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search threads..."
          className="min-w-0 flex-1 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]/60"
        />
        {isLoading && <Loader2 className="size-3.5 animate-spin text-[var(--color-text-dim)]" />}
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-[12px] text-[var(--color-text-dim)]">
            <MailOpen className="size-6 text-[var(--color-text-dim)]/40" />
            <p>{activeFolder === "inbox" ? "Inbox is empty." : "No items here."}</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {threads.map((thread) => {
              const active = thread.id === activeThreadId;
              const lastMessage = thread.messages[thread.messages.length - 1];
              const date = new Date(thread.lastMessageAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              });
              return (
                <div
                  key={thread.id}
                  className={`group flex gap-2 border-b border-[var(--color-border)] px-3 py-2.5 transition-colors ${
                    active
                      ? "bg-[var(--color-accent-soft)]/60"
                      : "hover:bg-white/[0.02]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectThread(thread.id)}
                    className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                  >
                    <span
                      className={`truncate text-[12.5px] ${
                        thread.isRead
                          ? "font-normal text-[var(--color-text-dim)]"
                          : "font-medium text-[var(--color-text)]"
                      }`}
                    >
                      {thread.participants.join(", ")}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {!thread.isRead && (
                        <span className="inline-block size-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-text)]">
                        {thread.subject}
                      </span>
                    </div>
                    <p className="line-clamp-1 text-[11.5px] text-[var(--color-text-dim)]">
                      {lastMessage?.snippet ?? ""}
                    </p>
                  </button>

                  <div className="relative flex h-6 w-[52px] shrink-0 items-center justify-end self-start">
                    <span className="text-[10.5px] text-[var(--color-text-dim)] transition-opacity group-hover:pointer-events-none group-hover:opacity-0">
                      {date}
                    </span>
                    <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => {
                          if (thread.isRead) void markUnread(thread.id);
                          else void markRead(thread.id);
                        }}
                        className="grid size-6 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                        title={thread.isRead ? "Mark unread" : "Mark read"}
                      >
                        {thread.isRead ? (
                          <Mail className="size-3" />
                        ) : (
                          <MailOpen className="size-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void archiveThread(thread.id)}
                        className="grid size-6 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                        title="Archive"
                      >
                        <Archive className="size-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
