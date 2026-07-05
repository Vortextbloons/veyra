import { create } from "zustand";
import type { EmailAccount, EmailThread, EmailDraft, EmailFolder, EmailAttachment } from "./email-types";
import {
  emailListAccounts,
  emailListThreads,
  emailGetThread,
  emailArchiveThread,
  emailMarkRead,
  emailMarkUnread,
  emailSendMessage,
  emailSaveDraft,
  emailAddAccount,
  emailConfigureGmailOauth,
  emailConnectGmail,
  emailConnectGmailWithConfig,
  emailHasGmailOauthConfig,
  emailSyncAccount,
  emailSyncAllGmail,
  emailRemoveAccount,
  emailListFolders,
  emailListAttachments,
  emailDownloadAttachment,
  emailExtractAttachmentText,
  emailOpenAttachment,
} from "./tauri-commands";

type EmailStore = {
  accounts: EmailAccount[];
  folders: EmailFolder[];
  threads: EmailThread[];
  activeAccountId: string | null;
  activeThreadId: string | null;
  activeFolder: string;
  searchQuery: string;
  draft: EmailDraft | null;
  isComposing: boolean;
  isLoading: boolean;
  error: string | null;
  hydrationState: "loading" | "ready";
  attachments: Record<string, EmailAttachment[]>;
  attachmentLoadingIds: Set<string>;

  hydrateAccounts: () => Promise<void>;
  loadFolders: (accountId?: string) => Promise<void>;
  addAccount: (provider: string, email: string, name: string) => Promise<void>;
  configureGmailOauth: (clientId: string, clientSecret: string) => Promise<void>;
  connectGmail: () => Promise<void>;
  connectGmailWithConfig: (clientId: string, clientSecret: string) => Promise<void>;
  hasGmailOauthConfig: boolean;
  syncAccount: (accountId: string) => Promise<void>;
  syncAllGmail: () => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
  selectAccount: (id: string | null) => void;
  selectThread: (id: string | null) => void;
  setFolder: (folder: string) => void;
  setSearchQuery: (query: string) => void;
  loadThreads: () => Promise<void>;
  loadThread: (threadId: string) => Promise<void>;
  archiveThread: (threadId: string) => Promise<void>;
  markRead: (threadId: string) => Promise<void>;
  markUnread: (threadId: string) => Promise<void>;
  startCompose: (draft?: Partial<EmailDraft>) => void;
  cancelCompose: () => void;
  sendDraft: () => Promise<void>;
  saveDraft: () => Promise<void>;
  loadAttachments: (messageId: string) => Promise<void>;
  downloadAttachment: (attachmentId: string) => Promise<void>;
  extractAttachmentText: (attachmentId: string) => Promise<void>;
  openAttachment: (attachmentId: string) => Promise<void>;
};

let hydrationPromise: Promise<void> | null = null;

function mapAccountFromBackend(account: EmailAccount): EmailAccount {
  let status: EmailAccount["status"] = account.status;
  if (account.syncStatus === "syncing") {
    status = "syncing";
  } else if (account.syncStatus === "error") {
    status = "disconnected";
  } else if (status !== "disconnected") {
    status = "connected";
  }
  return { ...account, status };
}

async function fetchMappedAccounts(): Promise<EmailAccount[]> {
  const accounts = await emailListAccounts();
  return accounts.map(mapAccountFromBackend);
}

function isGmailScopeIssue(error: unknown): boolean {
  const message = String(error);
  return (
    message.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT") ||
    message.includes("insufficient authentication scopes") ||
    message.includes("Insufficient Permission")
  );
}

export const useEmailStore = create<EmailStore>((set, get) => ({
  accounts: [],
  folders: [],
  threads: [],
  activeAccountId: null,
  activeThreadId: null,
  activeFolder: "inbox",
  searchQuery: "",
  draft: null,
  isComposing: false,
  isLoading: false,
  error: null,
  hydrationState: "loading",
  hasGmailOauthConfig: false,
  attachments: {},
  attachmentLoadingIds: new Set(),

  hydrateAccounts: async () => {
    if (get().hydrationState === "ready") return;
    hydrationPromise ??= (async () => {
      try {
        const [accounts, hasGmailOauthConfig] = await Promise.all([
          fetchMappedAccounts(),
          emailHasGmailOauthConfig(),
        ]);
        set({ accounts, hydrationState: "ready", hasGmailOauthConfig });
        if (accounts.length > 0 && !get().activeAccountId) {
          set({ activeAccountId: accounts[0].id });
          await Promise.all([get().loadFolders(), get().loadThreads()]);
        }
      } catch (error) {
        set({ error: String(error), hydrationState: "ready" });
      }
    })().finally(() => {
      hydrationPromise = null;
    });
    await hydrationPromise;
  },

  loadFolders: async (accountId) => {
    const targetId = accountId ?? get().activeAccountId;
    try {
      const folders = await emailListFolders(targetId ?? undefined);
      set({ folders, error: null });
    } catch (err) {
      set({ error: `Failed to load folders: ${String(err)}` });
    }
  },

  addAccount: async (provider, email, name) => {
    set({ isLoading: true, error: null });
    try {
      const account = mapAccountFromBackend(await emailAddAccount(provider, email, name));
      set((state) => ({
        accounts: [account, ...state.accounts],
        activeAccountId: account.id,
        activeThreadId: null,
        activeFolder: "inbox",
        isLoading: false,
      }));
      await Promise.all([get().loadFolders(), get().loadThreads()]);
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  configureGmailOauth: async (clientId, clientSecret) => {
    set({ isLoading: true, error: null });
    try {
      await emailConfigureGmailOauth({ clientId, clientSecret });
      set({ isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  connectGmail: async () => {
    set({ isLoading: true, error: null });
    try {
      const account = mapAccountFromBackend(await emailConnectGmail());
      set((state) => ({
        accounts: [account, ...state.accounts],
        activeAccountId: account.id,
        activeThreadId: null,
        activeFolder: "inbox",
        isLoading: false,
      }));
      await Promise.all([get().loadFolders(), get().loadThreads()]);
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  connectGmailWithConfig: async (clientId, clientSecret) => {
    set({ isLoading: true, error: null });
    try {
      const account = mapAccountFromBackend(
        await emailConnectGmailWithConfig({ clientId, clientSecret }),
      );
      set((state) => ({
        accounts: [account, ...state.accounts],
        activeAccountId: account.id,
        activeThreadId: null,
        activeFolder: "inbox",
        hasGmailOauthConfig: true,
        isLoading: false,
      }));
      await Promise.all([get().loadFolders(), get().loadThreads()]);
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  syncAccount: async (accountId) => {
    set({ isLoading: true, error: null });
    // Show syncing state immediately.
    set((state) => ({
      accounts: state.accounts.map((a) =>
        a.id === accountId ? { ...a, status: "syncing" as const } : a,
      ),
    }));
    try {
      await emailSyncAccount(accountId);
      const accounts = await fetchMappedAccounts();
      set({ isLoading: false, accounts });
      if (get().activeAccountId === accountId || get().activeFolder === "unified") {
        await Promise.all([get().loadFolders(), get().loadThreads()]);
      }
    } catch (error) {
      if (isGmailScopeIssue(error)) {
        const accounts = await fetchMappedAccounts().catch(() => get().accounts);
        set({
          error:
            "Google connected, but Gmail scopes were not granted. Revoke Veyra access, reconnect with the correct test user, and confirm gmail.modify / gmail.send / gmail.compose are saved in Google Cloud.",
          isLoading: false,
          accounts,
        });
        return;
      }
      const accounts = await fetchMappedAccounts().catch(() =>
        get().accounts.map((a) =>
          a.id === accountId ? { ...a, status: "disconnected" as const } : a,
        ),
      );
      set({
        error: String(error),
        isLoading: false,
        accounts,
      });
    }
  },

  syncAllGmail: async () => {
    set({ isLoading: true, error: null });
    set((state) => ({
      accounts: state.accounts.map((a) =>
        a.provider === "gmail" && a.status === "connected"
          ? { ...a, status: "syncing" as const }
          : a,
      ),
    }));
    try {
      await emailSyncAllGmail();
      const accounts = await fetchMappedAccounts();
      set({ isLoading: false, accounts });
      await Promise.all([get().loadFolders(), get().loadThreads()]);
    } catch (error) {
      const accounts = await fetchMappedAccounts().catch(() => get().accounts);
      set({
        error: String(error),
        isLoading: false,
        accounts,
      });
    }
  },

  removeAccount: async (accountId) => {
    set({ isLoading: true, error: null });
    try {
      await emailRemoveAccount(accountId);
      set((state) => {
        const nextAccounts = state.accounts.filter((a) => a.id !== accountId);
        const nextActiveId =
          state.activeAccountId === accountId
            ? (nextAccounts[0]?.id ?? null)
            : state.activeAccountId;
        return {
          accounts: nextAccounts,
          activeAccountId: nextActiveId,
          activeThreadId:
            state.activeAccountId === accountId ? null : state.activeThreadId,
          threads: state.activeAccountId === accountId ? [] : state.threads,
          folders: state.activeAccountId === accountId ? [] : state.folders,
          isLoading: false,
        };
      });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  selectAccount: (id) => {
    set({
      activeAccountId: id,
      activeThreadId: null,
      threads: [],
      folders: [],
      draft: null,
      isComposing: false,
    });
    if (id) {
      void get().loadFolders();
      void get().loadThreads();
    }
  },

  selectThread: (id) => {
    set({ activeThreadId: id, isComposing: false });
    if (id) void get().loadThread(id);
  },

  setFolder: (folder) => {
    set({ activeFolder: folder, activeThreadId: null, threads: [] });
    if (folder === "unified" || get().activeAccountId) {
      void get().loadThreads();
    }
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  loadThreads: async () => {
    const { activeAccountId, activeFolder, searchQuery, accounts } = get();
    if (activeFolder !== "unified" && !activeAccountId) return;

    const accountId =
      activeFolder === "unified"
        ? (activeAccountId ?? accounts[0]?.id ?? "")
        : activeAccountId!;

    set({ isLoading: true, error: null });
    try {
      const threads = await emailListThreads(
        accountId,
        activeFolder,
        searchQuery || undefined,
      );
      set({ threads, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  loadThread: async (threadId) => {
    set({ isLoading: true, error: null });
    try {
      const thread = await emailGetThread(threadId);
      set((state) => ({
        threads: state.threads.map((t) => (t.id === thread.id ? thread : t)),
        isLoading: false,
      }));
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  archiveThread: async (threadId) => {
    const { activeAccountId } = get();
    if (!activeAccountId) return;
    try {
      await emailArchiveThread(threadId, activeAccountId);
      set((state) => ({
        threads: state.threads.filter((t) => t.id !== threadId),
        activeThreadId: state.activeThreadId === threadId ? null : state.activeThreadId,
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  markRead: async (threadId) => {
    const { activeAccountId } = get();
    if (!activeAccountId) return;
    try {
      await emailMarkRead(threadId, activeAccountId);
      set((state) => ({
        threads: state.threads.map((t) =>
          t.id === threadId ? { ...t, isRead: true } : t,
        ),
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  markUnread: async (threadId) => {
    const { activeAccountId } = get();
    if (!activeAccountId) return;
    try {
      await emailMarkUnread(threadId, activeAccountId);
      set((state) => ({
        threads: state.threads.map((t) =>
          t.id === threadId ? { ...t, isRead: false } : t,
        ),
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  startCompose: (partialDraft) => {
    const { activeAccountId } = get();
    set({
      isComposing: true,
      activeThreadId: null,
      draft: {
        id: crypto.randomUUID(),
        accountId: activeAccountId ?? "",
        to: "",
        cc: "",
        bcc: "",
        subject: "",
        body: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...partialDraft,
      },
    });
  },

  cancelCompose: () => {
    set({ isComposing: false, draft: null });
  },

  sendDraft: async () => {
    const { draft } = get();
    if (!draft) return;
    set({ isLoading: true, error: null });
    try {
      await emailSendMessage({
        accountId: draft.accountId,
        to: draft.to,
        cc: draft.cc,
        bcc: draft.bcc,
        subject: draft.subject,
        body: draft.body,
      });
      set({ isComposing: false, draft: null, isLoading: false });
      await get().loadThreads();
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  saveDraft: async () => {
    const { draft } = get();
    if (!draft) return;
    try {
      const saved = await emailSaveDraft(draft);
      set({ draft: saved });
      if (get().activeFolder === "drafts") await get().loadThreads();
    } catch (error) {
      set({ error: String(error) });
    }
  },

  loadAttachments: async (messageId) => {
    try {
      const atts = await emailListAttachments(messageId);
      set((state) => ({
        attachments: { ...state.attachments, [messageId]: atts },
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  downloadAttachment: async (attachmentId) => {
    set((state) => ({
      attachmentLoadingIds: new Set([...state.attachmentLoadingIds, attachmentId]),
    }));
    try {
      const updated = await emailDownloadAttachment(attachmentId);
      set((state) => {
        const msgAtts = state.attachments[updated.messageId] ?? [];
        const nextAtts = msgAtts.map((a) => (a.id === attachmentId ? updated : a));
        const nextLoading = new Set(state.attachmentLoadingIds);
        nextLoading.delete(attachmentId);
        return {
          attachments: { ...state.attachments, [updated.messageId]: nextAtts },
          attachmentLoadingIds: nextLoading,
        };
      });
    } catch (error) {
      try {
        const msgId =
          Object.values(get().attachments)
            .flat()
            .find((a) => a.id === attachmentId)?.messageId ?? "";
        const updated = await emailListAttachments(msgId);
        const refreshed = updated.find((a) => a.id === attachmentId);
        if (refreshed) {
          set((state) => {
            const msgAtts = state.attachments[refreshed.messageId] ?? [];
            const nextAtts = msgAtts.map((a) => (a.id === attachmentId ? refreshed : a));
            const nextLoading = new Set(state.attachmentLoadingIds);
            nextLoading.delete(attachmentId);
            return {
              attachments: { ...state.attachments, [refreshed.messageId]: nextAtts },
              attachmentLoadingIds: nextLoading,
            };
          });
          return;
        }
      } catch {
        // fall through to just clear loading
      }
      set((state) => {
        const nextLoading = new Set(state.attachmentLoadingIds);
        nextLoading.delete(attachmentId);
        return { error: String(error), attachmentLoadingIds: nextLoading };
      });
    }
  },

  extractAttachmentText: async (attachmentId) => {
    set((state) => ({
      attachmentLoadingIds: new Set([...state.attachmentLoadingIds, attachmentId]),
    }));
    try {
      const updated = await emailExtractAttachmentText(attachmentId);
      set((state) => {
        const msgAtts = state.attachments[updated.messageId] ?? [];
        const nextAtts = msgAtts.map((a) => (a.id === attachmentId ? updated : a));
        const nextLoading = new Set(state.attachmentLoadingIds);
        nextLoading.delete(attachmentId);
        return {
          attachments: { ...state.attachments, [updated.messageId]: nextAtts },
          attachmentLoadingIds: nextLoading,
        };
      });
    } catch (error) {
      set((state) => {
        const nextLoading = new Set(state.attachmentLoadingIds);
        nextLoading.delete(attachmentId);
        return { error: String(error), attachmentLoadingIds: nextLoading };
      });
    }
  },

  openAttachment: async (attachmentId) => {
    try {
      await emailOpenAttachment(attachmentId);
    } catch (error) {
      set({ error: String(error) });
    }
  },
}));
