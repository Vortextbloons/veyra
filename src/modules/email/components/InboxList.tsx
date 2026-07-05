import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Archive,
  Loader2,
  MailOpen,
  Mail,
  Shield,
  Reply,
  Tag,
} from "lucide-react";
import { useEmailStore } from "../email-store";

const URGENCY_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-yellow-400/60",
  low: "",
};

export function InboxList() {
  const threads = useEmailStore((s) => s.threads);
  const activeThreadId = useEmailStore((s) => s.activeThreadId);
  const activeFolder = useEmailStore((s) => s.activeFolder);
  const activeSmartView = useEmailStore((s) => s.activeSmartView);
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

  const headerLabel = activeSmartView
    ? SMART_VIEW_LABELS[activeSmartView] ?? "Smart View"
    : activeFolder === "unified"
      ? "Unified Inbox"
      : activeFolder.charAt(0).toUpperCase() + activeFolder.slice(1);

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
            <p>
              {activeSmartView
                ? `No ${headerLabel.toLowerCase()} threads.`
                : activeFolder === "inbox"
                  ? "Inbox is empty."
                  : "No items here."}
            </p>
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
              const ai = thread.aiMetadata;
              const previewText = ai?.summary || lastMessage?.snippet || "";
              const urgencyLevel = ai?.urgency;
              const urgencyColor = urgencyLevel ? URGENCY_COLORS[urgencyLevel] : "";
              const isHighSpam = (ai?.spamScore ?? 0) > 0.7;
              const isMarketing = (ai?.marketingScore ?? 0) > 0.7 || ai?.newsletter;
              const needsReply = ai?.needsReply;
              const aiTags = ai?.tags ?? [];

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
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`truncate text-[12.5px] ${
                          thread.isRead
                            ? "font-normal text-[var(--color-text-dim)]"
                            : "font-medium text-[var(--color-text)]"
                        }`}
                      >
                        {thread.participants.join(", ")}
                      </span>
                      {urgencyColor && (
                        <span
                          className={`inline-block size-2 shrink-0 rounded-full ${urgencyColor}`}
                          title={`Urgency: ${urgencyLevel}`}
                        />
                      )}
                      {needsReply && (
                        <span title="Needs reply">
                          <Reply className="size-3 shrink-0 text-[var(--color-accent)]" />
                        </span>
                      )}
                      {isHighSpam && (
                        <span title="Likely spam">
                          <Shield className="size-3 shrink-0 text-red-400/70" />
                        </span>
                      )}
                      {!isHighSpam && isMarketing && (
                        <span title="Marketing/Newsletter">
                          <Shield className="size-3 shrink-0 text-amber-400/60" />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!thread.isRead && (
                        <span className="inline-block size-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-text)]">
                        {thread.subject}
                      </span>
                    </div>
                    {previewText && (
                      <p className="line-clamp-1 text-[11.5px] text-[var(--color-text-dim)]">
                        {previewText}
                      </p>
                    )}
                    {aiTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {aiTags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-0.5 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9.5px] text-[var(--color-text-dim)]"
                          >
                            <Tag className="size-2" />
                            {tag}
                          </span>
                        ))}
                        {aiTags.length > 3 && (
                          <span className="text-[9.5px] text-[var(--color-text-dim)]/60">
                            +{aiTags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
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

const SMART_VIEW_LABELS: Record<string, string> = {
  urgent: "Urgent",
  spam: "Suspected Spam",
  marketing: "Marketing",
  needs_reply: "Needs Reply",
  has_attachments: "Attachments",
};
