use crate::email::db::{self as email_db, EmailDbState};
use crate::shared::db_utils::run_db_command;
use tauri::{Manager, State};

#[tauri::command]
pub async fn email_list_accounts(
    state: State<'_, EmailDbState>,
) -> Result<Vec<email_db::EmailAccountRow>, String> {
    run_db_command(state.inner(), "email", email_db::list_accounts).await
}

#[tauri::command]
pub async fn email_add_account(
    provider: String,
    email: String,
    name: String,
    state: State<'_, EmailDbState>,
) -> Result<email_db::EmailAccountRow, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::add_account(conn, provider, email, name)
    })
    .await
}

#[tauri::command]
pub async fn email_configure_gmail_oauth(
    config: email_db::GmailOAuthConfigInput,
    state: State<'_, EmailDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::configure_gmail_oauth(conn, config)
    })
    .await
}

#[tauri::command]
pub async fn email_connect_gmail(
    state: State<'_, EmailDbState>,
) -> Result<email_db::EmailAccountRow, String> {
    run_db_command(state.inner(), "email", email_db::connect_gmail).await
}

#[tauri::command]
pub async fn email_connect_gmail_with_config(
    config: email_db::GmailOAuthConfigInput,
    state: State<'_, EmailDbState>,
) -> Result<email_db::EmailAccountRow, String> {
    let config_clone = email_db::GmailOAuthConfigInput {
        client_id: config.client_id.clone(),
        client_secret: config.client_secret.clone(),
    };
    run_db_command(state.inner(), "email", move |conn| {
        email_db::configure_gmail_oauth(conn, config_clone)?;
        email_db::connect_gmail_with_config(conn, &config.client_id, &config.client_secret)
    })
    .await
}

#[tauri::command]
pub async fn email_has_gmail_oauth_config(state: State<'_, EmailDbState>) -> Result<bool, String> {
    run_db_command(state.inner(), "email", email_db::has_gmail_oauth_config).await
}

#[tauri::command]
pub async fn email_sync_account(
    account_id: String,
    state: State<'_, EmailDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::sync_gmail_account(conn, account_id)
    })
    .await
}

#[tauri::command]
pub async fn email_remove_account(
    account_id: String,
    state: State<'_, EmailDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::remove_account(conn, account_id)
    })
    .await
}

#[tauri::command]
pub async fn email_list_folders(
    account_id: Option<String>,
    state: State<'_, EmailDbState>,
) -> Result<Vec<email_db::EmailFolderRow>, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::list_folders(conn, account_id)
    })
    .await
}

#[tauri::command]
pub async fn email_list_threads(
    account_id: String,
    folder_id: String,
    query: Option<String>,
    state: State<'_, EmailDbState>,
) -> Result<Vec<email_db::EmailThreadRow>, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::list_threads(conn, account_id, folder_id, query)
    })
    .await
}

#[tauri::command]
pub async fn email_get_thread(
    thread_id: String,
    state: State<'_, EmailDbState>,
) -> Result<email_db::EmailThreadRow, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::get_thread(conn, thread_id)
    })
    .await
}

#[tauri::command]
pub async fn email_send_message(
    draft: email_db::EmailDraftInput,
    state: State<'_, EmailDbState>,
) -> Result<email_db::EmailSendResult, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::send_message(conn, draft)
    })
    .await
}

#[tauri::command]
pub async fn email_save_draft(
    draft: email_db::EmailDraftInput,
    state: State<'_, EmailDbState>,
) -> Result<email_db::EmailDraftRow, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::save_draft(conn, draft)
    })
    .await
}

#[tauri::command]
pub async fn email_archive_thread(
    thread_id: String,
    account_id: String,
    state: State<'_, EmailDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::archive_thread(conn, thread_id, account_id)
    })
    .await
}

#[tauri::command]
pub async fn email_mark_read(
    thread_id: String,
    account_id: String,
    state: State<'_, EmailDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::set_read(conn, thread_id, account_id, true)
    })
    .await
}

#[tauri::command]
pub async fn email_mark_unread(
    thread_id: String,
    account_id: String,
    state: State<'_, EmailDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::set_read(conn, thread_id, account_id, false)
    })
    .await
}

#[tauri::command]
pub async fn email_sync_all_gmail(state: State<'_, EmailDbState>) -> Result<(), String> {
    run_db_command(state.inner(), "email", email_db::sync_all_gmail).await
}

#[tauri::command]
pub async fn email_reparse_message(
    message_id: String,
    state: State<'_, EmailDbState>,
) -> Result<email_db::EmailMessageRow, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::reparse_message(conn, &message_id)
    })
    .await
}

#[tauri::command]
pub async fn email_list_attachments(
    message_id: String,
    state: State<'_, EmailDbState>,
) -> Result<Vec<email_db::FullEmailAttachmentRow>, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::list_attachments(conn, &message_id)
    })
    .await
}

#[tauri::command]
pub async fn email_download_attachment(
    attachment_id: String,
    app: tauri::AppHandle,
    state: State<'_, EmailDbState>,
) -> Result<email_db::FullEmailAttachmentRow, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    run_db_command(state.inner(), "email", move |conn| {
        email_db::download_attachment(conn, &attachment_id, &app_data_dir)
    })
    .await
}

#[tauri::command]
pub async fn email_extract_attachment_text(
    attachment_id: String,
    state: State<'_, EmailDbState>,
) -> Result<email_db::FullEmailAttachmentRow, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::extract_attachment_text(conn, &attachment_id)
    })
    .await
}

#[tauri::command]
pub async fn email_open_attachment(
    attachment_id: String,
    app: tauri::AppHandle,
    state: State<'_, EmailDbState>,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    let path = run_db_command(state.inner(), "email", move |conn| {
        let att = email_db::get_attachment_row(conn, &attachment_id)?;
        if att.download_status != "downloaded" {
            email_db::download_attachment(conn, &attachment_id, &app_data_dir)?;
        }
        email_db::get_attachment_local_path(conn, &attachment_id)
    })
    .await?;
    open::that(&path).map_err(|e| format!("failed to open attachment: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn email_enqueue_ai_jobs(
    inputs: Vec<email_db::EmailAiJobInput>,
    state: State<'_, EmailDbState>,
) -> Result<Vec<email_db::EmailAiJobRow>, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::enqueue_ai_jobs(conn, &inputs)
    })
    .await
}

#[tauri::command]
pub async fn email_claim_ai_job(
    task_types: Vec<String>,
    state: State<'_, EmailDbState>,
) -> Result<Option<email_db::EmailAiJobRow>, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::claim_next_ai_job(conn, &task_types)
    })
    .await
}

#[tauri::command]
pub async fn email_complete_ai_job(
    input: email_db::EmailAiOutputInput,
    state: State<'_, EmailDbState>,
) -> Result<email_db::EmailAiJobRow, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::complete_ai_job(conn, &input)
    })
    .await
}

#[tauri::command]
pub async fn email_fail_ai_job(
    job_id: String,
    error: String,
    state: State<'_, EmailDbState>,
) -> Result<email_db::EmailAiJobRow, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::fail_ai_job(conn, &job_id, &error)
    })
    .await
}

#[tauri::command]
pub async fn email_cancel_ai_job(
    job_id: String,
    state: State<'_, EmailDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::cancel_ai_job(conn, &job_id)
    })
    .await
}

#[tauri::command]
pub async fn email_reconcile_ai_jobs(
    stale_after_ms: Option<i64>,
    state: State<'_, EmailDbState>,
) -> Result<u64, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::reconcile_orphaned_running_jobs(conn, stale_after_ms.unwrap_or(0))
    })
    .await
}

#[tauri::command]
pub async fn email_requeue_ai_job(
    job_id: String,
    state: State<'_, EmailDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::requeue_ai_job(conn, &job_id)
    })
    .await
}

#[tauri::command]
pub async fn email_clear_ai_data(
    state: State<'_, EmailDbState>,
) -> Result<email_db::EmailAiClearResult, String> {
    run_db_command(state.inner(), "email", email_db::clear_all_email_ai_data).await
}

#[tauri::command]
pub async fn email_list_ai_jobs(
    filter: email_db::EmailAiJobFilter,
    state: State<'_, EmailDbState>,
) -> Result<Vec<email_db::EmailAiJobRow>, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::list_ai_jobs(conn, &filter)
    })
    .await
}

#[tauri::command]
pub async fn email_list_ai_outputs(
    thread_id: String,
    state: State<'_, EmailDbState>,
) -> Result<Vec<email_db::EmailAiOutputRow>, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::list_ai_outputs(conn, &thread_id)
    })
    .await
}

#[tauri::command]
pub async fn email_get_unprocessed_thread_ids(
    account_id: String,
    task_type: String,
    state: State<'_, EmailDbState>,
) -> Result<Vec<String>, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::get_unprocessed_thread_ids(conn, &account_id, &task_type)
    })
    .await
}

#[tauri::command]
pub async fn email_list_tags(
    account_id: Option<String>,
    state: State<'_, EmailDbState>,
) -> Result<Vec<email_db::EmailTagRow>, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::list_tags(conn, account_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn email_create_tag(
    input: email_db::EmailCreateTagInput,
    state: State<'_, EmailDbState>,
) -> Result<email_db::EmailTagRow, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::create_tag(conn, &input)
    })
    .await
}

#[tauri::command]
pub async fn email_update_tag(
    input: email_db::EmailUpdateTagInput,
    state: State<'_, EmailDbState>,
) -> Result<email_db::EmailTagRow, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::update_tag(conn, &input)
    })
    .await
}

#[tauri::command]
pub async fn email_delete_tag(
    tag_id: String,
    state: State<'_, EmailDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::delete_tag(conn, &tag_id)
    })
    .await
}

#[tauri::command]
pub async fn email_apply_tag(
    input: email_db::EmailApplyTagInput,
    state: State<'_, EmailDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::apply_tag_to_message(conn, &input)
    })
    .await
}

#[tauri::command]
pub async fn email_remove_tag(
    input: email_db::EmailRemoveTagInput,
    state: State<'_, EmailDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::remove_tag_from_message(conn, &input)
    })
    .await
}

#[tauri::command]
pub async fn email_list_message_tags(
    message_id: String,
    state: State<'_, EmailDbState>,
) -> Result<Vec<email_db::EmailTagRow>, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::list_message_tags(conn, &message_id)
    })
    .await
}

#[tauri::command]
pub async fn email_upsert_ai_tags(
    message_id: String,
    tag_names: Vec<String>,
    confidence: f64,
    reason: String,
    state: State<'_, EmailDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::upsert_ai_tags(conn, &message_id, &tag_names, confidence, &reason)
    })
    .await
}

#[tauri::command]
pub async fn email_generate_ai_draft(
    input: email_db::EmailAiDraftGenerateInput,
    state: State<'_, EmailDbState>,
) -> Result<email_db::EmailAiJobRow, String> {
    run_db_command(state.inner(), "email", move |conn| {
        let thread = email_db::get_thread(conn, input.thread_id.clone())?;
        let last_msg = thread.messages.last().ok_or("thread has no messages")?;
        let job_input = email_db::EmailAiJobInput {
            account_id: input.account_id.clone(),
            thread_id: Some(input.thread_id.clone()),
            message_id: Some(last_msg.id.clone()),
            task_type: "reply_draft".to_string(),
            priority: 1,
            model_id: None,
            tone: input.tone,
        };
        let jobs = email_db::enqueue_ai_jobs(conn, &[job_input])?;
        jobs.into_iter()
            .next()
            .ok_or("failed to enqueue draft job".to_string())
    })
    .await
}

#[tauri::command]
pub async fn email_list_ai_drafts(
    thread_id: String,
    state: State<'_, EmailDbState>,
) -> Result<Vec<email_db::EmailAiDraftRow>, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::list_ai_drafts(conn, &thread_id)
    })
    .await
}

#[tauri::command]
pub async fn email_delete_ai_draft(
    draft_id: String,
    state: State<'_, EmailDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::delete_ai_draft(conn, &draft_id)
    })
    .await
}

#[tauri::command]
pub async fn email_save_ai_draft(
    input: email_db::EmailSaveAiDraftInput,
    state: State<'_, EmailDbState>,
) -> Result<email_db::EmailAiDraftRow, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::save_ai_draft(conn, &input)
    })
    .await
}

#[tauri::command]
pub async fn email_update_ai_draft_status(
    draft_id: String,
    status: String,
    state: State<'_, EmailDbState>,
) -> Result<email_db::EmailAiDraftRow, String> {
    run_db_command(state.inner(), "email", move |conn| {
        email_db::update_ai_draft_status(conn, &draft_id, &status)
    })
    .await
}
