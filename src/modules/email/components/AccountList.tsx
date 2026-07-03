import { useState } from "react";
import {
  Inbox,
  Send,
  FileText,
  Archive,
  Star,
  Mail,
  AlertCircle,
  Loader2,
  RefreshCw,
  MoreVertical,
  Tag,
  Trash2,
  ShieldAlert,
  Folder,
  Layers,
} from "lucide-react";
import { useEmailStore } from "../email-store";
import type { EmailAccount, EmailFolder } from "../email-types";
import { AccountDetails } from "./AccountDetails";

const KIND_ICONS: Record<string, typeof Inbox> = {
  inbox: Inbox,
  starred: Star,
  sent: Send,
  drafts: FileText,
  archive: Archive,
  trash: Trash2,
  spam: ShieldAlert,
  important: ShieldAlert,
  category: Tag,
  custom: Folder,
  unknown: Folder,
};

const KIND_ORDER = [
  "inbox",
  "starred",
  "sent",
  "drafts",
  "archive",
  "trash",
  "spam",
  "important",
  "category",
  "custom",
  "unknown",
];

function groupFolders(folders: EmailFolder[]): EmailFolder[] {
  const system = folders.filter((f) => f.isSystem);
  const custom = folders.filter((f) => !f.isSystem);
  const sorted = [...system, ...custom].sort((a, b) => {
    const ai = KIND_ORDER.indexOf(a.kind);
    const bi = KIND_ORDER.indexOf(b.kind);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return sorted;
}

export function AccountList() {
  const accounts = useEmailStore((s) => s.accounts);
  const folders = useEmailStore((s) => s.folders);
  const activeAccountId = useEmailStore((s) => s.activeAccountId);
  const activeFolder = useEmailStore((s) => s.activeFolder);
  const selectAccount = useEmailStore((s) => s.selectAccount);
  const setFolder = useEmailStore((s) => s.setFolder);
  const syncAccount = useEmailStore((s) => s.syncAccount);
  const syncAllGmail = useEmailStore((s) => s.syncAllGmail);
  const isLoading = useEmailStore((s) => s.isLoading);
  const [detailsAccount, setDetailsAccount] = useState<EmailAccount | null>(null);

  const grouped = groupFolders(folders);

  return (
    <aside className="flex w-[220px] min-w-[220px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-3">
        <Mail className="size-3.5 text-[var(--color-text-dim)]" />
        <span className="text-[12px] font-medium text-[var(--color-text)]">Accounts</span>
        {accounts.filter((a) => a.provider === "gmail").length > 1 && (
          <button
            type="button"
            onClick={() => void syncAllGmail()}
            disabled={isLoading}
            className="ml-auto grid size-5 place-items-center rounded text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-[var(--color-text)]"
            title="Sync all Gmail accounts"
          >
            <RefreshCw className={`size-3 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-[12px] text-[var(--color-text-dim)]">
            <AlertCircle className="size-5 text-[var(--color-text-dim)]/40" />
            <p>No accounts connected.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {accounts.map((account) => {
              const active = account.id === activeAccountId;
              return (
                <div
                  key={account.id}
                  className={`group flex items-center gap-1 rounded-md px-1.5 py-1.5 transition-colors ${
                    active
                      ? "bg-[var(--color-accent-soft)] text-white"
                      : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-[var(--color-text)]"
                  }`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => selectAccount(account.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        selectAccount(account.id);
                      }
                    }}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded px-1 py-0.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)]"
                  >
                    <div className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-[10px] font-semibold text-white">
                      {account.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium">
                        {account.name}
                      </div>
                      <div className="truncate text-[10.5px] text-[var(--color-text-dim)]">
                        {account.email}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 pr-1">
                    {account.status === "syncing" && (
                      <Loader2 className="size-3 shrink-0 animate-spin text-[var(--color-text-dim)]" />
                    )}
                    {account.status === "disconnected" && (
                      <AlertCircle className="size-3 shrink-0 text-red-400" />
                    )}
                    {account.status === "connected" && (
                      <button
                        type="button"
                        onClick={() => void syncAccount(account.id)}
                        disabled={isLoading}
                        className="grid size-5 place-items-center rounded text-[var(--color-text-dim)] opacity-0 transition-opacity hover:bg-white/5 hover:text-white group-hover:opacity-100"
                        title="Sync account"
                      >
                        <RefreshCw className="size-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDetailsAccount(account)}
                      className="grid size-5 place-items-center rounded text-[var(--color-text-dim)] opacity-0 transition-opacity hover:bg-white/5 hover:text-white group-hover:opacity-100"
                      title="Account details"
                    >
                      <MoreVertical className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Folder list */}
      <div className="border-t border-[var(--color-border)] p-2">
        <div className="flex flex-col gap-0.5">
          {/* Unified inbox — visible when multiple accounts exist */}
          {accounts.length > 1 && (
            <button
              type="button"
              onClick={() => setFolder("unified")}
              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                activeFolder === "unified"
                  ? "bg-[var(--color-accent-soft)] text-white"
                  : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-[var(--color-text)]"
              }`}
            >
              <Layers className="size-3.5" />
              <span className="flex-1">Unified Inbox</span>
            </button>
          )}
          {/* Per-account system folders */}
          {(["inbox", "starred", "sent", "drafts", "archive"] as const).map((kind) => {
            const Icon = KIND_ICONS[kind];
            const active = activeFolder === kind;
            // Scope unread count to the active account's folder.
            const dbFolder = folders.find(
              (f) => f.kind === kind && (activeAccountId ? f.accountId === activeAccountId : true),
            );
            const unread = dbFolder?.unreadCount ?? 0;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => setFolder(kind)}
                className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                  active
                    ? "bg-[var(--color-accent-soft)] text-white"
                    : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-[var(--color-text)]"
                }`}
              >
                <Icon className="size-3.5" />
                <span className="flex-1 capitalize">{kind}</span>
                {unread > 0 && (
                  <span className="min-w-[18px] rounded-full bg-[var(--color-accent)]/20 px-1.5 text-center text-[10px] font-medium text-[var(--color-accent)]">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Dynamic folders from Gmail labels */}
        {grouped.filter((f) => !["inbox", "sent", "drafts", "archive"].includes(f.kind) || f.kind === "category" || f.kind === "custom" || f.kind === "trash" || f.kind === "spam").length > 0 && (
          <>
            <div className="my-1.5 border-t border-[var(--color-border)]/50" />
            <div className="flex flex-col gap-0.5">
              {grouped
                .filter((f) => ["category", "custom", "trash", "spam", "important"].includes(f.kind))
                .map((folder) => {
                  const Icon = KIND_ICONS[folder.kind] ?? Folder;
                  const active = activeFolder === folder.id;
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => setFolder(folder.id)}
                      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                        active
                          ? "bg-[var(--color-accent-soft)] text-white"
                          : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-[var(--color-text)]"
                      }`}
                      title={folder.providerId}
                    >
                      <Icon className="size-3.5" />
                      <span className="flex-1 truncate">{folder.name}</span>
                      {folder.unreadCount > 0 && (
                        <span className="min-w-[18px] rounded-full bg-[var(--color-accent)]/20 px-1.5 text-center text-[10px] font-medium text-[var(--color-accent)]">
                          {folder.unreadCount > 99 ? "99+" : folder.unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </>
        )}
      </div>
      {detailsAccount && (
        <AccountDetails
          account={detailsAccount}
          onClose={() => setDetailsAccount(null)}
        />
      )}
    </aside>
  );
}
