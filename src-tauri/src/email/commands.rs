use crate::shared::db_utils::run_db_command;
use crate::email::db::{self as email_db, EmailDbState};
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
pub async fn email_sync_all_gmail(
    state: State<'_, EmailDbState>,
) -> Result<(), String> {
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
