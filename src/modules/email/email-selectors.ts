import type { EmailAccount, EmailThread, EmailAttachment, EmailTag } from "./email-types";

type EmailState = {
  accounts: EmailAccount[];
  folders: { id: string; name: string }[];
  threads: EmailThread[];
  activeAccountId: string | null;
  activeThreadId: string | null;
  activeFolder: string;
  activeSmartView: string | null;
  searchQuery: string;
  draft: { id: string; accountId: string; to: string; cc: string; bcc: string; subject: string; body: string } | null;
  isComposing: boolean;
  isLoading: boolean;
  error: string | null;
  hydrationState: "loading" | "ready";
  attachments: Record<string, EmailAttachment[]>;
  attachmentLoadingIds: Set<string>;
  tags: EmailTag[];
  messageTags: Record<string, EmailTag[]>;
};

export function selectAccounts(state: EmailState): EmailAccount[] {
  return state.accounts;
}

export function selectFolders(state: EmailState) {
  return state.folders;
}

export function selectThreads(state: EmailState): EmailThread[] {
  return state.threads;
}

export function selectActiveAccountId(state: EmailState): string | null {
  return state.activeAccountId;
}

export function selectActiveThreadId(state: EmailState): string | null {
  return state.activeThreadId;
}

export function selectActiveFolder(state: EmailState): string {
  return state.activeFolder;
}

export function selectActiveSmartView(state: EmailState): string | null {
  return state.activeSmartView;
}

export function selectSearchQuery(state: EmailState): string {
  return state.searchQuery;
}

export function selectDraft(state: EmailState) {
  return state.draft;
}

export function selectIsComposing(state: EmailState): boolean {
  return state.isComposing;
}

export function selectIsLoading(state: EmailState): boolean {
  return state.isLoading;
}

export function selectError(state: EmailState): string | null {
  return state.error;
}

export function selectHydrationState(state: EmailState): "loading" | "ready" {
  return state.hydrationState;
}

export function selectAttachments(state: EmailState): Record<string, EmailAttachment[]> {
  return state.attachments;
}

export function selectAttachmentLoadingIds(state: EmailState): Set<string> {
  return state.attachmentLoadingIds;
}

export function selectTags(state: EmailState): EmailTag[] {
  return state.tags;
}

export function selectMessageTags(state: EmailState): Record<string, EmailTag[]> {
  return state.messageTags;
}

export function selectActiveAccount(state: EmailState): EmailAccount | undefined {
  return state.accounts.find((a) => a.id === state.activeAccountId);
}

export function selectActiveThreads(state: EmailState): EmailThread[] {
  return state.threads;
}

export function selectUnreadCount(state: EmailState): number {
  return state.threads.filter((t) => !t.isRead).length;
}

export const selectMessageAttachments = (messageId: string) =>
  (state: EmailState): EmailAttachment[] => {
    return state.attachments[messageId] ?? [];
  };

export const selectMessageTagsForMessage = (messageId: string) =>
  (state: EmailState): EmailTag[] => {
    return state.messageTags[messageId] ?? [];
  };

export function selectConnectedAccounts(state: EmailState): EmailAccount[] {
  return state.accounts.filter((a) => a.status === "connected");
}

export function selectGmailAccounts(state: EmailState): EmailAccount[] {
  return state.accounts.filter((a) => a.provider === "gmail");
}

export const selectAccountById = (accountId: string) =>
  (state: EmailState): EmailAccount | undefined => {
    return state.accounts.find((a) => a.id === accountId);
  };

export const selectIsThreadActive = (threadId: string) =>
  (state: EmailState): boolean => {
    return state.activeThreadId === threadId;
  };

export const selectThreadById = (threadId: string) =>
  (state: EmailState): EmailThread | undefined => {
    return state.threads.find((t) => t.id === threadId);
  };
