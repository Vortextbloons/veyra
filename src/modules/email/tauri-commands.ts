import { invoke } from "@tauri-apps/api/core";
import type {
  EmailAccount,
  EmailThread,
  EmailDraft,
  EmailFolder,
  EmailMessage,
  EmailAttachment,
} from "./email-types";

export async function emailListAccounts(): Promise<EmailAccount[]> {
  return invoke<EmailAccount[]>("email_list_accounts");
}

export async function emailAddAccount(
  provider: string,
  email: string,
  name: string,
): Promise<EmailAccount> {
  return invoke<EmailAccount>("email_add_account", { provider, email, name });
}

export async function emailRemoveAccount(accountId: string): Promise<void> {
  return invoke<void>("email_remove_account", { accountId });
}

export async function emailListFolders(
  accountId?: string,
): Promise<EmailFolder[]> {
  return invoke<EmailFolder[]>("email_list_folders", {
    accountId: accountId ?? null,
  });
}

export async function emailListThreads(
  accountId: string,
  folderId: string,
  query?: string,
): Promise<EmailThread[]> {
  return invoke<EmailThread[]>("email_list_threads", {
    accountId,
    folderId,
    query: query || null,
  });
}

export async function emailGetThread(threadId: string): Promise<EmailThread> {
  return invoke<EmailThread>("email_get_thread", { threadId });
}

export async function emailSendMessage(
  draft: Omit<EmailDraft, "id" | "createdAt" | "updatedAt">,
): Promise<{ sent: boolean; messageId?: string }> {
  return invoke("email_send_message", { draft });
}

export async function emailSaveDraft(
  draft: Partial<EmailDraft>,
): Promise<EmailDraft> {
  return invoke<EmailDraft>("email_save_draft", { draft });
}

export async function emailArchiveThread(
  threadId: string,
  accountId: string,
): Promise<void> {
  return invoke<void>("email_archive_thread", { threadId, accountId });
}

export async function emailMarkRead(
  threadId: string,
  accountId: string,
): Promise<void> {
  return invoke<void>("email_mark_read", { threadId, accountId });
}

export async function emailMarkUnread(
  threadId: string,
  accountId: string,
): Promise<void> {
  return invoke<void>("email_mark_unread", { threadId, accountId });
}

export async function emailConfigureGmailOauth(config: {
  clientId: string;
  clientSecret: string;
}): Promise<void> {
  return invoke<void>("email_configure_gmail_oauth", { config });
}

export async function emailConnectGmail(): Promise<EmailAccount> {
  return invoke<EmailAccount>("email_connect_gmail");
}

export async function emailConnectGmailWithConfig(config: {
  clientId: string;
  clientSecret: string;
}): Promise<EmailAccount> {
  return invoke<EmailAccount>("email_connect_gmail_with_config", { config });
}

export async function emailHasGmailOauthConfig(): Promise<boolean> {
  return invoke<boolean>("email_has_gmail_oauth_config");
}

export async function emailSyncAccount(accountId: string): Promise<void> {
  return invoke<void>("email_sync_account", { accountId });
}

export async function emailSyncAllGmail(): Promise<void> {
  return invoke<void>("email_sync_all_gmail");
}

export async function emailReparseMessage(
  messageId: string,
): Promise<EmailMessage> {
  return invoke<EmailMessage>("email_reparse_message", { messageId });
}

export async function emailListAttachments(
  messageId: string,
): Promise<EmailAttachment[]> {
  return invoke<EmailAttachment[]>("email_list_attachments", { messageId });
}

export async function emailDownloadAttachment(
  attachmentId: string,
): Promise<EmailAttachment> {
  return invoke<EmailAttachment>("email_download_attachment", { attachmentId });
}

export async function emailExtractAttachmentText(
  attachmentId: string,
): Promise<EmailAttachment> {
  return invoke<EmailAttachment>("email_extract_attachment_text", {
    attachmentId,
  });
}

export async function emailOpenAttachment(attachmentId: string): Promise<void> {
  return invoke<void>("email_open_attachment", { attachmentId });
}
