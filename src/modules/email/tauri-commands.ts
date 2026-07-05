import { invoke } from "@tauri-apps/api/core";
import type {
  EmailAccount,
  EmailThread,
  EmailDraft,
  EmailFolder,
  EmailMessage,
  EmailAttachment,
  EmailAiJob,
  EmailAiOutput,
  EmailAiJobInput,
  EmailAiOutputInput,
  EmailAiJobFilter,
  EmailTag,
  EmailCreateTagInput,
  EmailUpdateTagInput,
  EmailApplyTagInput,
  EmailRemoveTagInput,
  EmailAiDraft,
  EmailAiDraftGenerateInput,
  EmailSaveAiDraftInput,
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

export async function emailEnqueueAiJobs(
  inputs: EmailAiJobInput[],
): Promise<EmailAiJob[]> {
  return invoke<EmailAiJob[]>("email_enqueue_ai_jobs", { inputs });
}

export async function emailClaimAiJob(
  taskTypes: string[],
): Promise<EmailAiJob | null> {
  return invoke<EmailAiJob | null>("email_claim_ai_job", { taskTypes });
}

export async function emailCompleteAiJob(
  input: EmailAiOutputInput,
): Promise<EmailAiJob> {
  return invoke<EmailAiJob>("email_complete_ai_job", { input });
}

export async function emailFailAiJob(
  jobId: string,
  error: string,
): Promise<EmailAiJob> {
  return invoke<EmailAiJob>("email_fail_ai_job", { jobId, error });
}

export async function emailCancelAiJob(jobId: string): Promise<void> {
  return invoke<void>("email_cancel_ai_job", { jobId });
}

export async function emailReconcileAiJobs(staleAfterMs = 0): Promise<number> {
  return invoke<number>("email_reconcile_ai_jobs", { staleAfterMs });
}

export async function emailRequeueAiJob(jobId: string): Promise<void> {
  return invoke<void>("email_requeue_ai_job", { jobId });
}

export async function emailListAiJobs(
  filter: EmailAiJobFilter,
): Promise<EmailAiJob[]> {
  return invoke<EmailAiJob[]>("email_list_ai_jobs", { filter });
}

export async function emailListAiOutputs(
  threadId: string,
): Promise<EmailAiOutput[]> {
  return invoke<EmailAiOutput[]>("email_list_ai_outputs", { threadId });
}

export async function emailGetUnprocessedThreadIds(
  accountId: string,
  taskType: string,
): Promise<string[]> {
  return invoke<string[]>("email_get_unprocessed_thread_ids", {
    accountId,
    taskType,
  });
}

export async function emailListTags(
  accountId?: string,
): Promise<EmailTag[]> {
  return invoke<EmailTag[]>("email_list_tags", {
    accountId: accountId ?? null,
  });
}

export async function emailCreateTag(
  input: EmailCreateTagInput,
): Promise<EmailTag> {
  return invoke<EmailTag>("email_create_tag", { input });
}

export async function emailUpdateTag(
  input: EmailUpdateTagInput,
): Promise<EmailTag> {
  return invoke<EmailTag>("email_update_tag", { input });
}

export async function emailDeleteTag(tagId: string): Promise<void> {
  return invoke<void>("email_delete_tag", { tagId });
}

export async function emailApplyTag(input: EmailApplyTagInput): Promise<void> {
  return invoke<void>("email_apply_tag", { input });
}

export async function emailRemoveTag(input: EmailRemoveTagInput): Promise<void> {
  return invoke<void>("email_remove_tag", { input });
}

export async function emailListMessageTags(
  messageId: string,
): Promise<EmailTag[]> {
  return invoke<EmailTag[]>("email_list_message_tags", { messageId });
}

export async function emailUpsertAiTags(
  messageId: string,
  tagNames: string[],
  confidence: number,
  reason: string,
): Promise<void> {
  return invoke<void>("email_upsert_ai_tags", {
    messageId,
    tagNames,
    confidence,
    reason,
  });
}

export async function emailGenerateAiDraft(
  input: EmailAiDraftGenerateInput,
): Promise<EmailAiJob> {
  return invoke<EmailAiJob>("email_generate_ai_draft", { input });
}

export async function emailListAiDrafts(
  threadId: string,
): Promise<EmailAiDraft[]> {
  return invoke<EmailAiDraft[]>("email_list_ai_drafts", { threadId });
}

export async function emailDeleteAiDraft(draftId: string): Promise<void> {
  return invoke<void>("email_delete_ai_draft", { draftId });
}

export async function emailSaveAiDraft(
  input: EmailSaveAiDraftInput,
): Promise<EmailAiDraft> {
  return invoke<EmailAiDraft>("email_save_ai_draft", { input });
}

export async function emailUpdateAiDraftStatus(
  draftId: string,
  status: string,
): Promise<EmailAiDraft> {
  return invoke<EmailAiDraft>("email_update_ai_draft_status", {
    draftId,
    status,
  });
}
