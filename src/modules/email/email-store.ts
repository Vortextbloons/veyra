import { create } from "zustand";
import type { EmailAccount, EmailThread, EmailDraft, EmailFolder, EmailAttachment, EmailTag, EmailCreateTagInput, EmailUpdateTagInput, SmartView, EmailAiDraft, EmailAiDraftGenerateInput, EmailAiCoverageSnapshot, EmailAiJob } from "./email-types";
import { useSettingsStore } from "@/stores/settings-store";
import { emailAiWorker } from "./email-ai-worker";
import { fetchEmailAiCoverage } from "./email-ai-coverage";
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
  emailListTags,
  emailCreateTag,
  emailUpdateTag,
  emailDeleteTag,
  emailApplyTag,
  emailRemoveTag,
  emailListMessageTags,
  emailGenerateAiDraft,
  emailListAiDrafts,
  emailUpdateAiDraftStatus,
  emailListAiJobs,
  emailCancelAiJob,
  emailReconcileAiJobs,
  emailClearAiData,
} from "./tauri-commands";

export {
  selectAccounts,
  selectFolders,
  selectThreads,
  selectActiveAccountId,
  selectActiveThreadId,
  selectActiveFolder,
  selectActiveSmartView,
  selectSearchQuery,
  selectDraft,
  selectIsComposing,
  selectIsLoading,
  selectError,
  selectHydrationState,
  selectAttachments,
  selectAttachmentLoadingIds,
  selectTags,
  selectMessageTags,
  selectActiveAccount,
  selectActiveThreads,
  selectUnreadCount,
  selectMessageAttachments,
  selectMessageTagsForMessage,
  selectConnectedAccounts,
  selectGmailAccounts,
  selectAccountById,
  selectIsThreadActive,
  selectThreadById,
  selectIsAiDraft,
} from "./email-selectors";

type EmailStore = {
  accounts: EmailAccount[];
  folders: EmailFolder[];
  threads: EmailThread[];
  activeAccountId: string | null;
  activeThreadId: string | null;
  activeFolder: string;
  activeSmartView: SmartView | null;
  searchQuery: string;
  draft: EmailDraft | null;
  isComposing: boolean;
  isLoading: boolean;
  error: string | null;
  hydrationState: "loading" | "ready";
  attachments: Record<string, EmailAttachment[]>;
  attachmentLoadingIds: Set<string>;
  tags: EmailTag[];
  messageTags: Record<string, EmailTag[]>;
  aiDrafts: EmailAiDraft[];
  aiDraftLoading: boolean;
  aiDraftThreadId: string | null;
  isAiDraft: boolean;
  aiCoverage: EmailAiCoverageSnapshot | null;
  aiCoverageLoading: boolean;
  aiScanLoading: boolean;

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
  setSmartView: (view: SmartView | null) => void;
  setSearchQuery: (query: string) => void;
  loadThreads: () => Promise<void>;
  loadThread: (threadId: string, options?: { silent?: boolean }) => Promise<void>;
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
  loadTags: (accountId?: string) => Promise<void>;
  createTag: (input: EmailCreateTagInput) => Promise<void>;
  updateTag: (input: EmailUpdateTagInput) => Promise<void>;
  deleteTag: (tagId: string) => Promise<void>;
  applyTag: (messageId: string, tagId: string, source: string) => Promise<void>;
  removeTagFromMessage: (messageId: string, tagId: string) => Promise<void>;
  loadMessageTags: (messageId: string) => Promise<void>;
  loadAiDrafts: (threadId: string) => Promise<void>;
  generateAiDraft: (input: EmailAiDraftGenerateInput) => Promise<void>;
  deleteAiDraft: (draftId: string) => Promise<void>;
  insertAiDraftIntoCompose: (draft: EmailAiDraft) => void;
  loadAiCoverage: (accountId?: string, options?: { silent?: boolean }) => Promise<void>;
  refreshAfterEmailAiJob: (job: EmailAiJob) => Promise<void>;
  runEmailAiScan: (accountId?: string) => Promise<void>;
  cancelQueuedAiJobs: (accountId?: string) => Promise<void>;
  startEmailAi: () => void;
  stopEmailAi: () => void;
  resetEmailAi: () => Promise<void>;
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

let emailAiWorkerStarted = false;
let emailAiJobSettledHandlerRegistered = false;
let aiCoverageRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const pendingAiCoverageAccountIds = new Set<string>();

function scheduleAiCoverageRefresh(accountId: string): void {
  pendingAiCoverageAccountIds.add(accountId);
  if (aiCoverageRefreshTimer) return;
  aiCoverageRefreshTimer = setTimeout(() => {
    aiCoverageRefreshTimer = null;
    const accountIds = [...pendingAiCoverageAccountIds];
    pendingAiCoverageAccountIds.clear();
    for (const id of accountIds) {
      void useEmailStore.getState().loadAiCoverage(id, { silent: true });
    }
  }, 250);
}

function registerEmailAiJobSettledHandler(): void {
  if (emailAiJobSettledHandlerRegistered) return;
  emailAiJobSettledHandlerRegistered = true;
  emailAiWorker.onJobSettled(({ job }) => {
    void useEmailStore.getState().refreshAfterEmailAiJob(job);
  });
}

export function startEmailAiWorker(): void {
  registerEmailAiJobSettledHandler();
  if (!emailAiWorkerStarted) {
    emailAiWorker.start();
    emailAiWorkerStarted = true;
  } else if (!emailAiWorker.getStatus().running) {
    emailAiWorker.start();
  } else {
    emailAiWorker.applyRuntimeSettings();
  }
}

function ensureEmailAiWorkerRunning(): void {
  if (!useSettingsStore.getState().emailAiEnabled) {
    throw new Error("Enable Email AI in settings to generate drafts.");
  }
  startEmailAiWorker();
}

export function stopEmailAiWorker(): void {
  emailAiWorker.stop();
  emailAiWorkerStarted = false;
}

export const useEmailStore = create<EmailStore>((set, get) => ({
  accounts: [],
  folders: [],
  threads: [],
  activeAccountId: null,
  activeThreadId: null,
  activeFolder: "inbox",
  activeSmartView: null,
  searchQuery: "",
  draft: null,
  isComposing: false,
  isLoading: false,
  error: null,
  hydrationState: "loading",
  hasGmailOauthConfig: false,
  attachments: {},
  attachmentLoadingIds: new Set(),
  tags: [],
  messageTags: {},
  aiDrafts: [],
  aiDraftLoading: false,
  aiDraftThreadId: null,
  isAiDraft: false,
  aiCoverage: null,
  aiCoverageLoading: false,
  aiScanLoading: false,

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
          await Promise.all([get().loadFolders(), get().loadThreads(), get().loadTags()]);
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
      if (useSettingsStore.getState().emailAiEnabled) {
        startEmailAiWorker();
        void emailAiWorker.enqueueForNewMessages(accountId);
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
      if (useSettingsStore.getState().emailAiEnabled) {
        startEmailAiWorker();
        const accountIds = accounts.filter((a) => a.provider === "gmail").map((a) => a.id);
        for (const id of accountIds) {
          void emailAiWorker.enqueueForNewMessages(id);
        }
      }
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
      activeSmartView: null,
      threads: [],
      folders: [],
      draft: null,
      isComposing: false,
    });
    if (id) {
      void get().loadFolders();
      void get().loadThreads();
      void get().loadTags();
    }
  },

  selectThread: (id) => {
    set({ activeThreadId: id, isComposing: false, aiDrafts: [], aiDraftThreadId: null });
    if (id) void get().loadThread(id);
  },

  setFolder: (folder) => {
    set({ activeFolder: folder, activeSmartView: null, activeThreadId: null, threads: [] });
    if (folder === "unified" || get().activeAccountId) {
      void get().loadThreads();
    }
  },

  setSmartView: (view) => {
    set({ activeSmartView: view, activeFolder: "inbox", activeThreadId: null, threads: [] });
    if (get().activeAccountId) {
      void get().loadThreads();
    }
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  loadThreads: async () => {
    const { activeAccountId, activeFolder, activeSmartView, searchQuery, accounts } = get();
    if (activeFolder !== "unified" && !activeAccountId) return;

    const accountId =
      activeFolder === "unified"
        ? (activeAccountId ?? accounts[0]?.id ?? "")
        : activeAccountId!;

    const folderId = activeSmartView ? `smart:${activeSmartView}` : activeFolder;

    set({ isLoading: true, error: null });
    try {
      const threads = await emailListThreads(
        accountId,
        folderId,
        searchQuery || undefined,
      );
      set({ threads, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  loadThread: async (threadId, options) => {
    if (!options?.silent) {
      set({ isLoading: true, error: null });
    }
    try {
      const thread = await emailGetThread(threadId);
      set((state) => ({
        threads: state.threads.map((t) => (t.id === thread.id ? thread : t)),
        isLoading: options?.silent ? state.isLoading : false,
      }));
    } catch (error) {
      set((state) => ({
        error: String(error),
        isLoading: options?.silent ? state.isLoading : false,
      }));
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
      isAiDraft: false,
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
    set({ isComposing: false, draft: null, isAiDraft: false });
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
      set({ isComposing: false, draft: null, isLoading: false, isAiDraft: false });
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

  loadTags: async (accountId) => {
    try {
      const tags = await emailListTags(accountId);
      set({ tags });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  createTag: async (input) => {
    try {
      await emailCreateTag(input);
      await get().loadTags(get().activeAccountId ?? undefined);
    } catch (error) {
      set({ error: String(error) });
    }
  },

  updateTag: async (input) => {
    try {
      await emailUpdateTag(input);
      await get().loadTags(get().activeAccountId ?? undefined);
    } catch (error) {
      set({ error: String(error) });
    }
  },

  deleteTag: async (tagId) => {
    try {
      await emailDeleteTag(tagId);
      await get().loadTags(get().activeAccountId ?? undefined);
    } catch (error) {
      set({ error: String(error) });
    }
  },

  applyTag: async (messageId, tagId, source) => {
    try {
      await emailApplyTag({ messageId, tagId, source });
      await get().loadMessageTags(messageId);
    } catch (error) {
      set({ error: String(error) });
    }
  },

  removeTagFromMessage: async (messageId, tagId) => {
    try {
      await emailRemoveTag({ messageId, tagId });
      await get().loadMessageTags(messageId);
    } catch (error) {
      set({ error: String(error) });
    }
  },

  loadMessageTags: async (messageId) => {
    try {
      const tags = await emailListMessageTags(messageId);
      set((state) => ({
        messageTags: { ...state.messageTags, [messageId]: tags },
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  loadAiDrafts: async (threadId) => {
    try {
      const drafts = await emailListAiDrafts(threadId);
      set({ aiDrafts: drafts, aiDraftThreadId: threadId });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  generateAiDraft: async (input) => {
    set({ aiDraftLoading: true, error: null, aiDraftThreadId: input.threadId });
    try {
      ensureEmailAiWorkerRunning();
      const job = await emailGenerateAiDraft(input);
      emailAiWorker.wake();

      const deadline = Date.now() + 120_000;
      let completed = false;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const jobs = await emailListAiJobs({
          accountId: input.accountId,
          limit: 100,
        });
        const current = jobs.find((j) => j.id === job.id);
        if (!current) continue;
        if (current.status === "completed") {
          completed = true;
          break;
        }
        if (current.status === "failed") {
          throw new Error(current.error || "Draft generation failed");
        }
        if (current.status === "cancelled") {
          throw new Error("Draft generation was cancelled");
        }
        emailAiWorker.wake();
      }

      if (!completed) {
        const jobs = await emailListAiJobs({
          accountId: input.accountId,
          limit: 100,
        });
        const current = jobs.find((j) => j.id === job.id);
        const status = current?.status ?? "unknown";
        if (status === "queued" || status === "running") {
          throw new Error(
            "Draft generation timed out. Ensure LM Studio is running and a draft model is selected in Email AI settings.",
          );
        }
        throw new Error("Draft generation did not complete.");
      }

      const drafts = await emailListAiDrafts(input.threadId);
      set({ aiDrafts: drafts, aiDraftLoading: false });
    } catch (error) {
      set({ error: String(error), aiDraftLoading: false });
    }
  },

  deleteAiDraft: async (draftId) => {
    try {
      await emailUpdateAiDraftStatus(draftId, "dismissed");
      set((state) => ({
        aiDrafts: state.aiDrafts.map((d) =>
          d.id === draftId ? { ...d, status: "dismissed" as const } : d
        ),
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  insertAiDraftIntoCompose: (draft) => {
    // Parse JSON address fields into plain address strings
    const parseAddresses = (json: string): string => {
      try {
        const addresses = JSON.parse(json) as Array<{ name?: string; email: string }>;
        if (!Array.isArray(addresses) || addresses.length === 0) return "";
        return addresses
          .map((a) => {
            if (a.name && a.name !== a.email) {
              return `${a.name} <${a.email}>`;
            }
            return a.email;
          })
          .join(", ");
      } catch {
        return json;
      }
    };

    set({
      isComposing: true,
      activeThreadId: null,
      isAiDraft: true,
      draft: {
        id: crypto.randomUUID(),
        accountId: draft.accountId,
        to: parseAddresses(draft.toJson),
        cc: parseAddresses(draft.ccJson),
        bcc: parseAddresses(draft.bccJson),
        subject: draft.subject,
        body: draft.body,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    });
    void emailUpdateAiDraftStatus(draft.id, "inserted").catch(() => {});
  },

  loadAiCoverage: async (accountId, options) => {
    const targetId = accountId ?? get().activeAccountId;
    if (!targetId) {
      set({ aiCoverage: null });
      return;
    }
    if (!options?.silent) {
      set({ aiCoverageLoading: true });
    }
    try {
      const threadCount = get().threads.filter((thread) => thread.accountId === targetId).length;
      const snapshot = await fetchEmailAiCoverage(targetId, threadCount);
      set({ aiCoverage: snapshot, aiCoverageLoading: false, error: null });
    } catch (error) {
      set({ aiCoverageLoading: false, error: String(error) });
    }
  },

  refreshAfterEmailAiJob: async (job) => {
    scheduleAiCoverageRefresh(job.accountId);
    if (job.threadId) {
      try {
        await get().loadThread(job.threadId, { silent: true });
      } catch {
        // Thread may have been deleted; coverage refresh still runs.
      }
      if (job.taskType === "reply_draft" && get().aiDraftThreadId === job.threadId) {
        await get().loadAiDrafts(job.threadId);
      }
    }
  },

  runEmailAiScan: async (accountId) => {
    const targetId = accountId ?? get().activeAccountId;
    if (!targetId) return;
    set({ aiScanLoading: true, error: null });
    try {
      ensureEmailAiWorkerRunning();
      await emailAiWorker.enqueueForNewMessages(targetId);
      emailAiWorker.wake();
      await get().loadAiCoverage(targetId);
      set({ aiScanLoading: false });
    } catch (error) {
      set({ aiScanLoading: false, error: String(error) });
    }
  },

  cancelQueuedAiJobs: async (accountId) => {
    const targetId = accountId ?? get().activeAccountId;
    if (!targetId) return;
    try {
      const queued = await emailListAiJobs({
        accountId: targetId,
        status: "queued",
        limit: 200,
      });
      await Promise.all(queued.map((job) => emailCancelAiJob(job.id)));
      await get().loadAiCoverage(targetId);
    } catch (error) {
      set({ error: String(error) });
    }
  },

  startEmailAi: () => {
    if (!useSettingsStore.getState().emailAiEnabled) return;
    startEmailAiWorker();
    emailAiWorker.wake();
    const accountId = get().activeAccountId;
    void emailReconcileAiJobs(0).then(() => get().loadAiCoverage(accountId ?? undefined));
  },

  stopEmailAi: () => {
    stopEmailAiWorker();
    void emailReconcileAiJobs(0).then(() => get().loadAiCoverage());
  },

  resetEmailAi: async () => {
    stopEmailAiWorker();
    try {
      await emailClearAiData();
      useSettingsStore.getState().resetEmailAiSettings();
      set({
        aiCoverage: null,
        aiDrafts: [],
        aiDraftThreadId: null,
        aiDraftLoading: false,
        aiScanLoading: false,
        error: null,
      });
      await get().loadThreads();
      const accountId = get().activeAccountId;
      if (accountId) {
        await get().loadAiCoverage(accountId);
      }
    } catch (error) {
      set({ error: String(error) });
    }
  },
}));

registerEmailAiJobSettledHandler();
